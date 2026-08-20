import { NextRequest, NextResponse } from "next/server";
import { PromptBuilder } from "@/core/prompt/PromptBuilder";
import { checkAuth } from "@/lib/supabaseServer";
import { getActiveSubscription, getPeriodUsage, estimatePageCount, recordUsage, type SourceFormat } from "@/lib/planUsage";
import {
  getBetaGrantStatus,
  reserveBetaDocSlot,
  completeBetaDocSlot,
  releaseBetaDocSlot,
  type BetaGrant,
} from "@/lib/betaAccess";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const CHUNK_SIZE = 18_000;
const CHUNK_OVERLAP = 600;

// ── Herramientas oficiales (Biblia FASE 3) ──────────────────────────────────
const TOOLS = ["explain", "summary", "questions", "study-guide", "analyze"] as const;
type Tool = (typeof TOOLS)[number];

const TOOL_DISPLAY_NAMES: Record<Tool, string> = {
  explain: "Explícamelo",
  summary: "Resúmelo",
  questions: "Generar Preguntas Inteligentes",
  "study-guide": "Crear Guía de Estudio",
  analyze: "Analizar Documento",
};

// Mismas etiquetas que ya usa el cliente (FileWizard) para mode/result_length,
// mapeadas explícitamente por tool (las 5 herramientas actuales no coinciden
// 1:1 en cantidad con las 4 etiquetas legado por posición).
const TOOL_MODE_LABELS: Record<Tool, string> = {
  explain: "explicar",
  summary: "resumir",
  questions: "preguntas",
  "study-guide": "guia-estudio",
  analyze: "analizar",
};
const LENGTH_LABELS: Record<number, string> = { 0.25: "corto", 0.5: "medio", 0.75: "largo", 1: "completo" };

function resolveModeLabel(tool: Tool): string {
  return TOOL_MODE_LABELS[tool];
}

function resolveResultLengthLabel(body: RequestBody): string {
  const extension = Number(body.extension);
  return LENGTH_LABELS[extension] ?? "medio";
}

// body.extension NO es la extensión del archivo (es el multiplicador de
// longitud de respuesta, ver resolveResultLengthLabel arriba) — el formato
// real del archivo se infiere de fileName, que sí trae la extensión real.
function inferSourceFormat(fileName: string): SourceFormat {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "txt") return "txt";
  return "unknown";
}

const SUMMARY_LENGTHS = ["short", "medium", "long"] as const;
type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

const SUMMARY_TARGET_RATIO: Record<SummaryLength, number> = {
  short: 0.25,
  medium: 0.5,
  long: 0.75,
};

const SUMMARY_TOLERANCE = { min: 0.8, max: 1.2 };

const SUMMARY_LENGTH_RULES: Record<SummaryLength, string> = {
  short:
    "Elimina ejemplos, explicaciones secundarias, repeticiones y detalles menores. Conserva únicamente la idea central, los puntos esenciales y la conclusión. El resultado debe sentirse claramente breve — nunca expliques el desarrollo completo, solo el núcleo.",
  medium:
    "Conserva las ideas principales, los datos importantes y el contexto necesario para entenderlas. Elimina redundancias y detalles secundarios que no cambien la comprensión del documento.",
  long:
    "Conserva casi todos los puntos relevantes del documento. Elimina únicamente repeticiones, relleno y detalles poco útiles — no elimines desarrollo, contexto ni matices importantes.",
};

const SUMMARY_EXPAND_FLOOR_RATIO: Record<SummaryLength, number | null> = {
  short: null,
  medium: 0.55,
  long: 0.8,
};

interface RequestBody {
  text?: unknown;
  fileName?: unknown;
  mode?: unknown;
  extension?: unknown;
  tool?: unknown;
  summaryLength?: unknown;
  declaredPageCount?: unknown;
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

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

function extensionToSummaryLength(extension: number): SummaryLength {
  if (extension <= 0.25) return "short";
  if (extension >= 0.75) return "long";
  return "medium";
}

function resolveSummaryLength(body: RequestBody): SummaryLength {
  if (typeof body.summaryLength === "string" && (SUMMARY_LENGTHS as readonly string[]).includes(body.summaryLength)) {
    return body.summaryLength as SummaryLength;
  }

  const legacyExtension = Number(body.extension);
  if (Number.isFinite(legacyExtension) && legacyExtension > 0) {
    return extensionToSummaryLength(legacyExtension);
  }

  return "medium";
}

function buildConfiguracion(tool: Tool, summaryLength: SummaryLength): string {
  return tool === "summary" ? `Extensión: ${summaryLength}` : "";
}

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
  // Declaradas fuera del try para que el catch externo pueda decidir si
  // corresponde liberar una reserva beta — betaReservationPending es el
  // estado explícito que gobierna esa decisión (ver más abajo), no la
  // nulidad de estas otras variables.
  let accessSource: "subscription" | "beta" | null = null;
  let betaGrantForCleanup: BetaGrant | null = null;
  let userIdForCleanup: string | null = null;
  let betaReservationPending = false;

  try {
    const body = (await req.json()) as RequestBody;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "documento";

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

    // ── Sesión obligatoria ──────────────────────────────────────────────
    const auth = await checkAuth(req);
    if (auth.status === "error") {
      console.error("[ia-explain AUTH CONFIG ERROR]", auth.message);
      return NextResponse.json({ error: "Error de configuración del servidor." }, { status: 500 });
    }
    if (auth.status !== "ok") {
      return NextResponse.json(
        { error: "Debes iniciar sesión para usar esta herramienta." },
        { status: 401 }
      );
    }
    const userId = auth.userId;

    // ── Plan y cuota — falla cerrado ─────────────────────────────────────
    let subscription;
    try {
      subscription = await getActiveSubscription(userId);
    } catch (err) {
      console.error("[ia-explain SUBSCRIPTION ERROR]", err);
      return NextResponse.json(
        { error: "No se pudo verificar tu plan. Intenta de nuevo en unos momentos." },
        { status: 503 }
      );
    }

    // ── Suscripción → beta → 403. Prioridad estricta: si hay suscripción
    // activa, beta ni se consulta. ──────────────────────────────────────
    let betaGrant: BetaGrant | null = null;

    if (subscription) {
      accessSource = "subscription";
    } else {
      let betaStatus;
      try {
        betaStatus = await getBetaGrantStatus(userId);
      } catch (err) {
        console.error("[ia-explain BETA GRANT ERROR]", err);
        return NextResponse.json(
          { error: "No se pudo verificar tu acceso. Intenta de nuevo en unos momentos." },
          { status: 503 }
        );
      }

      if (betaStatus.status === "none") {
        return NextResponse.json({ error: "No tienes un plan activo." }, { status: 403 });
      }

      if (betaStatus.status === "ended") {
        const message =
          betaStatus.reason === "expired"
            ? "Tu ronda beta expiró."
            : "Alcanzaste el límite de tu ronda beta.";
        return NextResponse.json({ error: message }, { status: 403 });
      }

      betaGrant = betaStatus.grant;
      accessSource = "beta";
      betaGrantForCleanup = betaGrant;
      userIdForCleanup = userId;
    }

    // declaredPageCount viene de la extracción previa (server-side, calculado
    // de los bytes reales del archivo en /api/extract-text) — no es un dato
    // de seguridad infalsificable, es un dato de esa extracción. Si falta o
    // es inválido (p. ej. una llamada directa a esta API sin pasar por
    // extract-text), se usa el cálculo autoderivado del propio texto.
    const declaredPageCount =
      typeof body.declaredPageCount === "number" &&
      Number.isFinite(body.declaredPageCount) &&
      body.declaredPageCount > 0
        ? Math.floor(body.declaredPageCount)
        : null;

    const pageCount = declaredPageCount ?? estimatePageCount(text, inferSourceFormat(fileName));

    if (accessSource === "subscription") {
      if (
        subscription!.limits.maxPagesPerDoc !== null &&
        pageCount > subscription!.limits.maxPagesPerDoc
      ) {
        return NextResponse.json(
          {
            error: `El documento supera el máximo de ${subscription!.limits.maxPagesPerDoc} páginas por documento de tu plan.`,
          },
          { status: 403 }
        );
      }
    } else {
      if (pageCount > betaGrant!.pagesPerDocLimit) {
        return NextResponse.json(
          {
            error: `El documento supera el máximo de ${betaGrant!.pagesPerDocLimit} páginas por documento de tu ronda beta.`,
          },
          { status: 403 }
        );
      }
    }

    if (accessSource === "subscription") {
      let usage;
      try {
        usage = await getPeriodUsage(userId, subscription!.periodStart, subscription!.periodEnd);
      } catch (err) {
        console.error("[ia-explain USAGE ERROR]", err);
        return NextResponse.json(
          { error: "No se pudo verificar tu consumo. Intenta de nuevo en unos momentos." },
          { status: 503 }
        );
      }

      // TODO: validación no atómica — dos requests simultáneas del mismo usuario
      // podrían leer el mismo `usage` y ambas pasar antes de que cualquiera
      // inserte su fila en document_history. Migrar a una función SQL/RPC
      // transaccional antes de producción.
      if (
        subscription!.limits.maxDocsMonthly !== null &&
        usage.docsUsed + 1 > subscription!.limits.maxDocsMonthly
      ) {
        return NextResponse.json(
          { error: "Alcanzaste el límite de documentos de este periodo." },
          { status: 403 }
        );
      }

      // No hay tope mensual de páginas en el schema real de `plans` (solo el
      // por-documento, ya validado arriba vía maxPagesPerDoc) — ese campo
      // (maxPagesMonthly) no existe como columna; ver nota en planUsage.ts.
    } else {
      // ── Reserva atómica beta — reemplaza getPeriodUsage+maxDocsMonthly para
      // este camino. reserveBetaDocSlot sube docs_used e in_flight en un solo
      // UPDATE guardado por WHERE (Fase 0), sin la carrera no-atómica del TODO
      // de arriba.
      const reserved = await reserveBetaDocSlot(betaGrant!.id, userId);
      if (!reserved) {
        return NextResponse.json(
          { error: "Alcanzaste el límite de tu ronda beta." },
          { status: 403 }
        );
      }
      betaReservationPending = true; // único lugar donde se activa, y solo tras reserved===true
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

    // ── Registro de uso — solo tras éxito de DeepSeek, nunca antes ──────
    let historyId: string;
    try {
      const saved = await recordUsage({
        userId,
        fileName,
        originalText: text,
        resultText: result,
        mode: resolveModeLabel(tool),
        resultLength: resolveResultLengthLabel(body),
        pageCount,
        origin: accessSource === "beta" ? "beta" : undefined,
        betaGrantId: accessSource === "beta" ? betaGrant!.id : undefined,
      });
      historyId = saved.id;
    } catch (err) {
      console.error("[ia-explain RECORD USAGE ERROR]", err);
      if (betaReservationPending && betaGrantForCleanup && userIdForCleanup) {
        try {
          await releaseBetaDocSlot(betaGrantForCleanup.id, userIdForCleanup);
        } catch (releaseErr) {
          console.error("[ia-explain RELEASE ERROR]", releaseErr);
        }
        betaReservationPending = false;
      }
      return NextResponse.json(
        { error: "El documento se generó pero no se pudo registrar el uso. Intenta de nuevo." },
        { status: 500 }
      );
    }

    // recordUsage tuvo éxito: el documento ya existe en document_history y el
    // consumo se considera comprometido desde este instante exacto. Se apaga
    // la bandera ANTES de intentar completar, para que ningún error posterior
    // (incluida una falla del propio completeBetaDocSlot) pueda disparar un
    // release que le devolvería un slot por un documento que sí se generó y
    // sí quedó guardado.
    if (accessSource === "beta") {
      betaReservationPending = false;
      try {
        await completeBetaDocSlot(betaGrant!.id, userId);
      } catch (err) {
        console.error("[ia-explain BETA COMPLETE ERROR]", err);
        // No se libera nada — docs_used se queda consumido (correcto, el
        // documento existe); in_flight podría quedar pegado en 1, riesgo
        // residual ya aceptado en el plan de Fase 0.
      }
    }

    const response: Record<string, unknown> = {
      result,
      resultChars: result.length,
      originalChars: text.length,
      chunksProcessed: chunks.length,
      tool,
      configuracion,
      historyId,
      pageCount,
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

    if (betaReservationPending && betaGrantForCleanup && userIdForCleanup) {
      try {
        await releaseBetaDocSlot(betaGrantForCleanup.id, userIdForCleanup);
      } catch (releaseErr) {
        console.error("[ia-explain RELEASE ERROR]", releaseErr);
      }
      betaReservationPending = false;
    }

    return NextResponse.json(
      { error: "Error al procesar el documento con la IA." },
      { status: 500 }
    );
  }
}
