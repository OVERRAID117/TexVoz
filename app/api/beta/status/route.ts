import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/supabaseServer";
import { getBetaGrantStatus, isBetaRedemptionEnabled } from "@/lib/betaAccess";

export type BetaStatusResponse =
  | { status: "none"; redemptionEnabled: boolean }
  | {
      status: "active";
      redemptionEnabled: boolean;
      roundNumber: number;
      docsUsed: number;
      docsLimit: number;
      pagesPerDocLimit: number;
      expiresAt: string;
    }
  | {
      status: "ended";
      redemptionEnabled: boolean;
      reason: "exhausted" | "expired";
      roundNumber: number;
      docsUsed: number;
      docsLimit: number;
      expiresAt: string;
    }
  | { status: "error" };

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);

  if (auth.status === "error") {
    console.error("[beta/status AUTH CONFIG ERROR]", auth.message);
    const response: BetaStatusResponse = { status: "error" };
    return NextResponse.json(response, { status: 500 });
  }

  if (auth.status !== "ok") {
    const response: BetaStatusResponse = { status: "error" };
    return NextResponse.json(response, { status: 401 });
  }

  const userId = auth.userId;

  // beta_settings ausente/ilegible -> false (fail-closed), nunca afecta a
  // una ronda ya activa — solo gobierna si se muestran/permiten canjes nuevos.
  const redemptionEnabled = await isBetaRedemptionEnabled();

  let grantStatus;
  try {
    grantStatus = await getBetaGrantStatus(userId);
  } catch (err) {
    console.error("[beta/status GRANT ERROR]", err);
    const response: BetaStatusResponse = { status: "error" };
    return NextResponse.json(response, { status: 503 });
  }

  if (grantStatus.status === "none") {
    const response: BetaStatusResponse = { status: "none", redemptionEnabled };
    return NextResponse.json(response, { status: 200 });
  }

  if (grantStatus.status === "ended") {
    const response: BetaStatusResponse = {
      status: "ended",
      redemptionEnabled,
      reason: grantStatus.reason,
      roundNumber: grantStatus.grant.roundNumber,
      docsUsed: grantStatus.grant.docsUsed,
      docsLimit: grantStatus.grant.docsLimit,
      expiresAt: grantStatus.grant.expiresAt,
    };
    return NextResponse.json(response, { status: 200 });
  }

  const { grant } = grantStatus;
  const response: BetaStatusResponse = {
    status: "active",
    redemptionEnabled,
    roundNumber: grant.roundNumber,
    docsUsed: grant.docsUsed,
    docsLimit: grant.docsLimit,
    pagesPerDocLimit: grant.pagesPerDocLimit,
    expiresAt: grant.expiresAt,
  };
  return NextResponse.json(response, { status: 200 });
}
