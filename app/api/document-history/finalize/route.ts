import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Mismos formatos que ya acepta /api/generate-doc y que ofrece
// FileWizard.tsx en handleDownloadFormat('txt' | 'docx' | 'pdf').
const ALLOWED_OUTPUT_FORMATS = ["txt", "docx", "pdf"] as const;
type OutputFormat = (typeof ALLOWED_OUTPUT_FORMATS)[number];

const INVALID = Symbol("invalid");

interface RequestBody {
  historyId?: unknown;
  resultText?: unknown;
  outputFormat?: unknown;
  outputFilename?: unknown;
}

function normalizeOutputFormat(value: unknown): OutputFormat | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && (ALLOWED_OUTPUT_FORMATS as readonly string[]).includes(value)) {
    return value as OutputFormat;
  }
  return INVALID;
}

function normalizeOutputFilename(value: unknown): string | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return INVALID;
  return value.trim() === "" ? null : value;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  try {
    const historyId = typeof body.historyId === "string" ? body.historyId.trim() : "";
    const resultText = typeof body.resultText === "string" ? body.resultText : "";

    if (!historyId || !resultText.trim()) {
      return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
    }

    const outputFormat = normalizeOutputFormat(body.outputFormat);
    if (outputFormat === INVALID) {
      return NextResponse.json({ error: "Formato de salida inválido." }, { status: 400 });
    }

    const outputFilename = normalizeOutputFilename(body.outputFilename);
    if (outputFilename === INVALID) {
      return NextResponse.json({ error: "Nombre de archivo inválido." }, { status: 400 });
    }

    const auth = await checkAuth(req);
    if (auth.status === "error") {
      console.error("[document-history finalize AUTH CONFIG ERROR]", auth.message);
      return NextResponse.json({ error: "Error de configuración del servidor." }, { status: 500 });
    }
    if (auth.status !== "ok") {
      return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("document_history")
      .update({
        result_text: resultText,
        output_format: outputFormat,
        output_filename: outputFilename,
      })
      .eq("id", historyId)
      .eq("user_id", auth.userId)
      .select("id, created_at")
      .maybeSingle();

    if (error) {
      console.error("[document-history finalize UPDATE ERROR]", error);
      return NextResponse.json({ error: "No se pudo actualizar el documento." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      historyId: data.id,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error("[document-history finalize ERROR]", error);
    return NextResponse.json({ error: "Error al actualizar el documento." }, { status: 500 });
  }
}
