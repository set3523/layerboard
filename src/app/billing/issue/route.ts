import { NextResponse } from "next/server";
import { issueBillingKey, chargeWithBillingKey } from "@/lib/toss";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeProration, firstChargeAmount, nextPeriodEnd, makeOrderId } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    // ✨ 본인 확인: 토큰으로 검증하고 customerKey 는 서버가 정함 (본문 값 신뢰 X)
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });
    const customerKey = user.id;

    const { authKey, plan } = await req.json();
    if (!authKey || (plan !== "pro" && plan !== "basic"))
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

    const now = new Date();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("plan, status, current_period_end").eq("id", customerKey).maybeSingle();

    // ✨ 멱등성: 이미 같은 플랜으로 활성 + 기간 남아있으면 재청구 없이 통과 (새로고침 대비)
    if (profile?.status === "active" && profile?.plan === plan && profile?.current_period_end && new Date(profile.current_period_end) > now) {
      return NextResponse.json({ ok: true, already: true });
    }

    const billing = await issueBillingKey(authKey, customerKey);      // 1) 빌링키 발급
    const billingKey = billing.billingKey;

    // 유료 Basic 이용 중에 Pro로 올리면 차액만 일할 청구, 그 외엔 정가 + 새 주기
    const upgradeBasicToPro =
      plan === "pro" && profile?.status === "active" && profile?.plan === "basic" && !!profile?.current_period_end;
    let amount: number, periodEnd: Date;
    if (upgradeBasicToPro) {
      periodEnd = new Date(profile!.current_period_end as string);
      amount = computeProration({ fromPlan: "basic", toPlan: "pro", periodEnd, now }).chargeNow;
    } else {
      amount = firstChargeAmount(plan);
      periodEnd = nextPeriodEnd(now);
    }

    let paymentKey: string | undefined;
    if (amount > 0) {                                                 // 3) 결제 승인
      const orderName = plan === "pro" ? "layboad Pro 구독" : "layboad Basic 구독";
      const payment = await chargeWithBillingKey({ billingKey, customerKey, amount, orderId: makeOrderId(), orderName });
      paymentKey = payment.paymentKey;
    }

    const { error: upErr } = await supabaseAdmin.from("profiles").update({  // 4) 플랜 전환 (basic/pro)
      plan, billing_key: billingKey, customer_key: customerKey,
      current_period_end: periodEnd.toISOString().slice(0, 10), status: "active",
      last_payment_key: paymentKey ?? null,    // 환불 시 필요
      past_due_since: null,                     // 재결제면 연체 해제
    }).eq("id", customerKey);
    if (upErr) throw new Error("프로필 업데이트 실패(컬럼 누락 가능): " + upErr.message);

    return NextResponse.json({ ok: true, amount, paymentKey });
  } catch (e: any) {
    console.error("billing/issue:", e);
    return NextResponse.json({ error: e?.message || "결제 처리 실패" }, { status: 400 });
  }
}
