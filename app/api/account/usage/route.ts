import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/supabaseServer";
import { getActiveSubscription, getPeriodUsage } from "@/lib/planUsage";
import { buildMetricUsage, type AccountUsageResponse } from "@/lib/accountUsage";

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);

  if (auth.status === "error") {
    console.error("[account/usage AUTH CONFIG ERROR]", auth.message);
    const response: AccountUsageResponse = { status: "error" };
    return NextResponse.json(response, { status: 500 });
  }

  if (auth.status !== "ok") {
    const response: AccountUsageResponse = { status: "error" };
    return NextResponse.json(response, { status: 401 });
  }

  const userId = auth.userId;

  let subscription;
  try {
    subscription = await getActiveSubscription(userId);
  } catch (err) {
    console.error("[account/usage SUBSCRIPTION ERROR]", err);
    const response: AccountUsageResponse = { status: "error" };
    return NextResponse.json(response, { status: 503 });
  }

  if (!subscription) {
    const response: AccountUsageResponse = { status: "no_plan" };
    return NextResponse.json(response, { status: 200 });
  }

  let usage;
  try {
    usage = await getPeriodUsage(userId, subscription.periodStart, subscription.periodEnd);
  } catch (err) {
    console.error("[account/usage USAGE ERROR]", err);
    const response: AccountUsageResponse = { status: "error" };
    return NextResponse.json(response, { status: 503 });
  }

  const docs = buildMetricUsage(usage.docsUsed, subscription.limits.maxDocsMonthly);
  const pages = buildMetricUsage(usage.pagesUsed, subscription.limits.maxPagesMonthly);

  const periodStartDate = new Date(subscription.periodStart);

  if (Number.isNaN(periodStartDate.getTime())) {
    throw new Error(`period_start inválido: ${subscription.periodStart}`);
  }

  const start = periodStartDate.toISOString().slice(0, 10);

  const periodEndExclusiveDate = new Date(subscription.periodEnd);

  if (Number.isNaN(periodEndExclusiveDate.getTime())) {
    throw new Error(`period_end inválido: ${subscription.periodEnd}`);
  }

  const endExclusive = periodEndExclusiveDate.toISOString().slice(0, 10);

  const response: AccountUsageResponse = {
    status: "ok",
    data: {
      plan: {
        name: subscription.planName,
        displayName: subscription.planDisplayName,
      },
      period: {
        start,
        endExclusive,
      },
      docs,
      pages,
    },
  };
  return NextResponse.json(response, { status: 200 });
}
