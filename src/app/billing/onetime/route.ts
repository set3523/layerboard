import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/toss";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_PRICE } from "@/lib/billing";

// 혼동 문자(0/O, 1/I) 제외한 코드 생성
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `LB-${seg()}-${seg()}`;
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });

    const { paymentKey, orderId, amount, plan } = await req.json();
    const p: "basic" | "pro" = plan === "pro" ? "pro" : "basic";
    if (!paymentKey || !orderId) return NextResponse.json({ error: "결제 정보가 없습니다." }, { status: 400 });
    if (Number(amount) !== PLAN_PRICE[p]) return NextResponse.json({ error: "결제 금액이 올바르지 않습니다." }, { status: 400 });

    // 새로고침 대비(멱등성): 이미 이 결제로 발급된 코드가 있으면 그대로 반환
    const { data: existing } = await supabaseAdmin.from("gift_codes").select("code, plan").eq("payment_key", paymentKey).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, code: existing.code, plan: existing.plan });

    // 1) 토스 최종 승인 (실패 시 코드 발급 안 함)
    const payment = await confirmPayment(paymentKey, orderId, Number(amount));

    // 2) 선물코드 발급 (중복 시 재시도)
    let code = "";
    for (let i = 0; i < 6; i++) {
      code = genCode();
      const { error } = await supabaseAdmin.from("gift_codes").insert({
        code, plan: p, days: 30, buyer_id: user.id, payment_key: (payment as any)?.paymentKey ?? paymentKey,
      });
      if (!error) break;
      if (i === 5) return NextResponse.json({ error: "코드 발급 실패(잠시 후 다시 시도)." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, code, plan: p });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "결제 처리 실패" }, { status: 500 });
  }
}
