import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/supabaseServer";
import { redeemBetaCode, type RedeemBetaCodeErrorReason } from "@/lib/betaAccess";

interface RequestBody {
  code?: unknown;
}

const ERROR_MESSAGES: Record<RedeemBetaCodeErrorReason, string> = {
  invalid_code: "Ese código no existe.",
  beta_disabled: "El acceso beta no está disponible en este momento.",
  code_disabled: "Ese código ya no está activo.",
  not_allowed: "Ese código no está disponible para tu cuenta.",
  code_exhausted: "Ese código ya alcanzó su límite de activaciones.",
  already_active: "Ya tienes una ronda beta activa.",
  unknown: "No se pudo procesar el código. Intenta de nuevo.",
};

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);

  if (auth.status === "error") {
    console.error("[beta/redeem AUTH CONFIG ERROR]", auth.message);
    return NextResponse.json({ error: "Error de configuración del servidor." }, { status: 500 });
  }

  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  // user_id SIEMPRE sale de checkAuth — nunca se lee del cuerpo de la request.
  const userId = auth.userId;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // Validación ligera antes de llamar al RPC (que es la fuente de verdad real
  // — esto solo evita un round-trip innecesario para un input obviamente vacío).
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Falta el código." }, { status: 400 });
  }

  let result;
  try {
    result = await redeemBetaCode(userId, code);
  } catch (err) {
    console.error("[beta/redeem ERROR]", err);
    return NextResponse.json(
      { error: "No se pudo procesar el código. Intenta de nuevo." },
      { status: 503 }
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[result.reason], reason: result.reason },
      { status: 403 }
    );
  }

  const { grant } = result;
  return NextResponse.json(
    {
      grant: {
        roundNumber: grant.roundNumber,
        docsUsed: grant.docsUsed,
        docsLimit: grant.docsLimit,
        pagesPerDocLimit: grant.pagesPerDocLimit,
        expiresAt: grant.expiresAt,
      },
    },
    { status: 200 }
  );
}
