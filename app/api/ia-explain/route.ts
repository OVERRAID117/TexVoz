import { NextRequest, NextResponse } from "next/server";
import { PromptBuilder } from "@/core/prompt/PromptBuilder";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const CHUNK_SIZE = 18_000;
const CHUNK_OVERLAP = 600;

// ── Herramientas oficiales (Biblia FASE 3) ──────────────────────────────────
// El orden coincide con el índice numérico "mode"/"iaMode" que el frontend
// actual todavía envía (compatibilidad temporal, ver Biblia FASE 5).
// Únicamente "summary" (Resúmelo) tiene configuración. Las demás son 100%
// automáticas — el motor decide todo internamente (Biblia FASE 3).
const TOOLS = ["explain", "summary", "questions", "study-guide", "analyze"] as const;
type Tool = (typeof TOOLS)[number];

const TOOL_DISPLAY_NAMES: Record<Tool, string> = {
  explain: "Explícamelo",
  summary: "Resúmelo",
  questions: "Generar Preguntas Inteligentes",
  "study-guide": "Crear Guía de Estudio",
  analyze: "Analizar Documento",
};

// ── Configuración — únicamente existe para Resúmelo ────────────────────────
const SUMMARY_LENGTHS = ["short", "medium", "long"] as const;
type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

// Solo Resúmelo controla longitud objetivo (Biblia FASE 3, Herramienta 2).
// Estos valores NUNCA se interpretan como porcentaje del documento — se usan
// únicamente como umbral interno de seguridad (ver expandIfTooShort), nunca
// como instrucción de longitud enviada al modelo.
const SUMMARY_TARGET_RATIO: Record<SummaryLength, number> = {
  short: 0.25,
  medium: 0.5,
  long: 0.75,
};

const SUMMARY_TOLERANCE = { min: 0.8, max: 1.2 };

// Regla cualitativa real de cada extensión — esto es lo que controla
// la diferencia entre Corto/Medio/Largo, no un conteo de caracteres.
const SUMMARY_LENGTH_RULES: Record<SummaryLength, string> = {
  short:
    "Elimina ejemplos, explicaciones secundarias, repeticiones y detalles menores. Conserva únicamente la idea central, los puntos esenciales y la conclusión. El resultado debe sentirse claramente breve — nunca expliques el desarrollo completo, solo el núcleo.",
  medium:
    "Conserva las ideas principales, los datos importantes y el contexto necesario para entenderlas. Elimina redundancias y detalles secundarios que no cambien la comprensión del documento.",
  long:
    "Conserva casi todos los puntos relevantes del documento. Elimina únicamente repeticiones, relleno y detalles poco útiles — no elimines desarrollo, contexto ni matices importantes.",
};

// Umbral de re-inflado (expandIfTooShort) — distinto por extensión.
// short:  null  → nunca se re-infla, un resumen corto real no es un error.
// medium: 0.55  → más laxo que antes (antes 0.8 para todas por igual).
// long:   0.8   → sin cambio respecto al comportamiento anterior.
const SUMMARY_EXPAND_FLOOR_RATIO: Record<SummaryLength, number | null> = {
  short: null,
  medium: 0.55,
  long: 0.8,
};

// ── Forma cruda del body — puede llegar en formato nuevo o legado ──────────
interface RequestBody {
  text?: unknown;
  // Formato legado (frontend actual)
  mode?: unknown;
  extension?: unknown;
  // Formato nuevo (una vez conectado el frontend, Biblia FASE 5)
  tool?: unknown;
  summaryLength?: unknown;
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

// ── Chunking (sin cambios) ──────────────────────────────────────────────────
function splitText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.trim();
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);

    if (end < clean.length) {
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      const sentenceBreak = Math.max(
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf("? ", end),
        clean.lastIndexOf("! ", end)
      );

      const safeBreak = Math.max(paragraphBreak, sentenceBreak);
      if (safeBreak > start + chunkSize * 0.65) {
        end = safeBreak + 1;
      }
    }

    chunks.push(clean.slice(start, end).trim());

    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.filter(Boolean);
}

// ── Resolución de la herramienta (nueva o legado por posición de "mode") ───
function isValidTool(value: unknown): value is Tool {
  return typeof value === "string" && (TOOLS as readonly string[]).includes(value);
}

function resolveTool(body: RequestBody): Tool | null {
  if (isValidTool(body.tool)) return body.tool;

  const legacyMode = Number(body.mode);
  if (Number.isInteger(legacyMode) && legacyMode >= 0 && legacyMode < TOOLS.length) {
    return TOOLS[legacyMode];
  }

  return null;
}

// ── Configuración de Resúmelo — única herramienta configurable ────────────
function extensionToSummaryLength(extension: number): SummaryLength {
  if (extension <= 0.25) return "short";
  if (extension >= 0.75) return "long";
  return "medium";
}

function resolveSummaryLength(body: RequestBody): SummaryLength {
  if (typeof body.summaryLength === "string" && (SUMMARY_LENGTHS as readonly string[]).includes(body.summaryLength)) {
    return body.summaryLength as SummaryLength;
  }

  // Compatibilidad temporal: el frontend actual todavía envía "extension" numérica.
  // Se traduce, nunca se trata como porcentaje real (Biblia FASE 3, Herramienta 2).
  const legacyExtension = Number(body.extension);
  if (Number.isFinite(legacyExtension) && legacyExtension > 0) {
    return extensionToSummaryLength(legacyExtension);
  }

  return "medium";
}

// {{CONFIGURACION}} solo tiene contenido real para Resúmelo. Las demás
// herramientas la reciben vacía — el motor decide todo automáticamente.
function buildConfiguracion(tool: Tool, summaryLength: SummaryLength): string {
  return tool === "summary" ? `Extensión: ${summaryLength}` : "";
}

// ── Instrucción por fragmento ────────────────────────────────────────────
interface LengthTarget {
  targetChars: number;
  minChars: number;
  maxChars: number;
}

function buildChunkInstruction(params: {
  tool: Tool;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  summaryLength?: SummaryLength;
}): string {
  const { tool, chunkIndex, totalChunks, summaryLength } = params;

  const rules: string[] = [
    "No inventes información.",
    "No agregues introducciones sobre el sistema, la herramienta o su configuración.",
    "No repitas el texto de otros fragmentos.",
  ];

  let criticalRule: string;

  if (tool === "summary") {
    criticalRule = SUMMARY_LENGTH_RULES[summaryLength ?? "medium"];
  } else if (tool === "questions") {
    criticalRule =
      "Genera EXCLUSIVAMENTE una lista de preguntas sobre este fragmento. Nunca produzcas un resumen, análisis, conclusión ni recomendación — si el contenido no permite preguntas útiles, genera menos preguntas, nunca cambies de formato. Adapta las preguntas al contenido real de este fragmento. Incluye variedad de niveles cuando el contenido lo permita: comprensión, memoria, análisis y aplicación. Evita preguntas obvias o repetidas entre sí. La cantidad debe ajustarse a la riqueza real de este fragmento, no a un número fijo.";
  } else if (tool === "study-guide") {
    criticalRule =
      "Genera una GUÍA DE ESTUDIO sobre este fragmento. Nunca te presentes como un análisis, auditoría o resumen ejecutivo — no uses títulos como \"Hallazgos\", \"Riesgos\" o \"Conclusiones del análisis\". Escribe como un profesor explicando a un estudiante, no como un analista reportando resultados.\n\nUsa exactamente esta estructura, en este orden:\n1. Objetivos de aprendizaje.\n2. Conceptos fundamentales, con explicaciones sencillas y las relaciones entre las ideas.\n3. Qué memorizar.\n4. Errores comunes — solo inclúyelos si el documento permite inferirlos con seguridad; si no, omite esta sección por completo, nunca inventes errores comunes.\n5. Preguntas de autoevaluación.\n6. Respuestas, separadas visualmente de las preguntas (nunca inmediatamente debajo de cada una), seguidas de un repaso rápido antes del examen.\n\nAdapta la cantidad de contenido de cada sección a lo que el fragmento realmente ofrezca — no rellenes una sección si el fragmento no da para ella.";
  } else {
    criticalRule =
      "Decide automáticamente el enfoque, la profundidad y la estructura más útiles para esta herramienta, siguiendo exactamente su objetivo definido en la Biblia — sin pedir ni asumir configuración del usuario.";
  }

  return `
Procesa únicamente el fragmento ${chunkIndex + 1} de ${totalChunks}.

CONTROL:
${rules.map((r) => `- ${r}`).join("\n")}

REGLA CRÍTICA:
${criticalRule}

Entrega solamente el texto procesado de este fragmento.
`.trim();
}

async function callDeepSeek(systemContent: string, userContent: string): Promise<string> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Corrección automática de longitud — únicamente aplica a Resúmelo.
async function expandIfTooShort(params: {
  systemContent: string;
  chunk: string;
  output: string;
  minChars: number;
  maxChars: number;
}): Promise<{ output: string; expanded: boolean }> {
  if (params.output.length >= params.minChars) {
    return { output: params.output, expanded: false };
  }

  const missingChars = params.minChars - params.output.length;
  const expansionPrompt = `
La versión anterior quedó demasiado corta.

Fragmento original:
${params.chunk}

Versión actual:
${params.output}

Amplía y reescribe la versión actual hasta alcanzar entre ${params.minChars} y ${params.maxChars} caracteres.
Faltan al menos ${missingChars} caracteres útiles.
Recupera detalles, transiciones, ejemplos, acciones, causas, consecuencias y matices presentes en el fragmento original.
No inventes información y no comentes estas instrucciones.
Entrega únicamente la versión completa corregida.
`.trim();

  const expandedOutput = await callDeepSeek(params.systemContent, expansionPrompt);
  return { output: expandedOutput, expanded: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Falta el texto a procesar." }, { status: 400 });
    }

    const tool = resolveTool(body);
    if (!tool) {
      return NextResponse.json(
        { error: "Herramienta inválida o no especificada." },
        { status: 400 }
      );
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "Falta DEEPSEEK_API_KEY." }, { status: 500 });
    }

    const summaryLength = resolveSummaryLength(body);
    const configuracion = buildConfiguracion(tool, summaryLength);
    const herramienta = TOOL_DISPLAY_NAMES[tool];
    const chunks = splitText(text);
    const builder = new PromptBuilder();

    const targetRatio = tool === "summary" ? SUMMARY_TARGET_RATIO[summaryLength] : null;

    const outputs: string[] = [];
    let totalInputChars = 0;
    let totalOutputChars = 0;
    let expansionCalls = 0;

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];

      const systemContent = builder.build({
        herramienta,
        configuracion,
        idioma: "Español",
        documento: chunk,
      });

      let lengthTarget: LengthTarget | undefined;

      if (tool === "summary" && targetRatio !== null) {
        const targetChars = Math.max(800, Math.round(chunk.length * targetRatio));
        lengthTarget = {
          targetChars,
          minChars: Math.round(targetChars * SUMMARY_TOLERANCE.min),
          maxChars: Math.round(targetChars * SUMMARY_TOLERANCE.max),
        };
      }

      const userContent = buildChunkInstruction({
        tool,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunk,
        summaryLength: tool === "summary" ? summaryLength : undefined,
      });

      let output = await callDeepSeek(systemContent, userContent);

      if (tool === "summary" && lengthTarget) {
        const floorRatio = SUMMARY_EXPAND_FLOOR_RATIO[summaryLength];
        const guardrailMinChars =
          floorRatio !== null ? Math.round(lengthTarget.targetChars * floorRatio) : null;

        if (guardrailMinChars !== null && output.length < guardrailMinChars) {
          expansionCalls += 1;
          const corrected = await expandIfTooShort({
            systemContent,
            chunk,
            output,
            minChars: guardrailMinChars,
            maxChars: lengthTarget.maxChars,
          });
          output = corrected.output;
        }
      }

      outputs.push(
        chunks.length > 1
          ? `## Parte ${index + 1} de ${chunks.length}\n\n${output}`
          : output
      );

      totalInputChars += chunk.length;
      totalOutputChars += output.length;
    }

    const result = outputs.join("\n\n");

    const response: Record<string, unknown> = {
      result,
      resultChars: result.length,
      originalChars: text.length,
      chunksProcessed: chunks.length,
      tool,
      configuracion,
      // Compatibilidad: el frontend actual todavía puede leer "mode" numérico.
      mode: TOOLS.indexOf(tool),
    };

    if (tool === "summary" && targetRatio !== null) {
      response.expectedChars = Math.round(text.length * targetRatio);
      response.achievedRatio =
        totalInputChars > 0 ? Number((totalOutputChars / totalInputChars).toFixed(3)) : null;
      response.expansionCalls = expansionCalls;
      response.percentage = Math.round(targetRatio * 100);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[ia-explain ERROR]", error);

    return NextResponse.json(
      {
        error: "Error al procesar el documento con la IA.",
        detail: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
