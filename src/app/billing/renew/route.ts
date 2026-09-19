import { NextResponse } from "next/server";
import { chargeWithBillingKey } from "@/lib/toss";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_PRICE, makeOrderId, nextPeriodEnd } from "@/lib/billing";

const GRACE_DAYS = 3; // 결제 실패 후 유예 일수 (이 동안 재시도, 지나면 다운그레이드)

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const results: any[] = [];

  // ── 1) 정기 갱신: active + 기간 만료 → 청구 (성공 시 결제일+30일, 실패 시 past_due 시작) ──
  const { data: dueActive } = await supabaseAdmin.from("profiles")
    .select("id, plan, billing_key, customer_key, current_period_end")
    .eq("status", "active").lte("current_period_end", today).not("billing_key", "is", null);

  for (const p of dueActive ?? []) {
    const amount = (PLAN_PRICE as any)[p.plan] ?? 0;
    if (!amount) continue;
    try {
      await chargeWithBillingKey({ billingKey: p.billing_key, customerKey: p.customer_key, amount, orderId: makeOrderId(), orderName: `layboad ${p.plan} 갱신` });
      await supabaseAdmin.from("profiles").update({
        current_period_end: nextPeriodEnd(now).toISOString().slice(0, 10),
        past_due_since: null,
      }).eq("id", p.id);
      results.push({ id: p.id, type: "renew", ok: true });
    } catch (e: any) {
      await supabaseAdmin.from("profiles").update({ status: "past_due", past_due_since: today }).eq("id", p.id);
      results.push({ id: p.id, type: "renew", ok: false, error: e?.message });
    }
  }

  // ── 2) past_due 재청구: 유예 내엔 매일 재시도, 유예 지나면 basic 다운그레이드 ──
  const { data: pastDue } = await supabaseAdmin.from("profiles")
    .select("id, plan, billing_key, customer_key, past_due_since")
    .eq("status", "past_due");

  for (const p of pastDue ?? []) {
    const amount = (PLAN_PRICE as any)[p.plan] ?? 0;
    let recovered = false;
    if (p.billing_key && amount) {
      try {
        await chargeWithBillingKey({ billingKey: p.billing_key, customerKey: p.customer_key, amount, orderId: makeOrderId(), orderName: `layboad ${p.plan} 재청구` });
        await supabaseAdmin.from("profiles").update({
          status: "active",
          current_period_end: nextPeriodEnd(now).toISOString().slice(0, 10),
          past_due_since: null,
        }).eq("id", p.id);
        results.push({ id: p.id, type: "retry", ok: true });
        recovered = true;
      } catch (e: any) {
        results.push({ id: p.id, type: "retry", ok: false, error: e?.message });
      }
    }
    if (recovered) continue;

    // 유예 만료 여부
    const since = p.past_due_since ? new Date(p.past_due_since) : now;
    const graceEnd = new Date(since.getTime() + GRACE_DAYS * 86400000);
    if (now > graceEnd) {
      await supabaseAdmin.from("profiles").update({
        status: "canceled", plan: "basic",
        billing_key: null, current_period_end: null, past_due_since: null,
      }).eq("id", p.id);
      results.push({ id: p.id, type: "downgrade_pastdue", ok: true });
    }
  }

  // ── 3) 해지 정리: canceled + 기간 지남 → basic 다운그레이드 (배지/혜택 실제로 내림) ──
  const { data: canceledExpired } = await supabaseAdmin.from("profiles")
    .select("id")
    .eq("status", "canceled").lt("current_period_end", today).not("current_period_end", "is", null);

  for (const p of canceledExpired ?? []) {
    await supabaseAdmin.from("profiles").update({ plan: "basic", current_period_end: null }).eq("id", p.id);
    results.push({ id: p.id, type: "downgrade_canceled", ok: true });
  }

  return NextResponse.json({ processed: results.length, results });
}
