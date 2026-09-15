// src/lib/billingClient.ts  (클라이언트 — 카드 등록창 띄우기)
import { supabase } from "./supabase";
import { PLAN_PRICE, makeOrderId } from "./billing";

const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

function loadTossSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("브라우저 전용"));
    if ((window as any).TossPayments) return resolve((window as any).TossPayments);
    const s = document.createElement("script");
    s.src = TOSS_SDK_URL;
    s.onload = () => resolve((window as any).TossPayments);
    s.onerror = () => reject(new Error("토스 SDK 로드 실패"));
    document.head.appendChild(s);
  });
}

// Pro 구독 시작 → 카드 등록창 → successUrl 로 리다이렉트
export async function startSubscription(plan: "basic" | "pro" = "pro") {
  // getSession: 저장된 세션 사용(만료 시 자동 갱신). getUser는 만료 시 null로 튕겨 로그인 풀림.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    window.location.href = "/login";
    return;
  }

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    alert("결제 설정이 필요합니다 (.env 의 NEXT_PUBLIC_TOSS_CLIENT_KEY).");
    return;
  }

  const TossPayments = await loadTossSdk();
  const toss = TossPayments(clientKey);
  const payment = toss.payment({ customerKey: user.id }); // customerKey = 우리 유저 id

  await payment.requestBillingAuth({
    method: "CARD",
    successUrl: `${window.location.origin}/billing/success?plan=${plan}`,
    failUrl: `${window.location.origin}/billing/fail`,
    customerEmail: user.email ?? undefined,
    customerName: user.email?.split("@")[0] ?? undefined,
  });
}

// 🎁 단건(1개월권) 결제 → 일반결제창 → onetime-success 로 리다이렉트 → 코드 발급
export async function startOneTime(plan: "basic" | "pro" = "basic") {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) { window.location.href = "/login"; return; }

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) { alert("결제 설정이 필요합니다 (.env 의 NEXT_PUBLIC_TOSS_CLIENT_KEY)."); return; }

  const amount = PLAN_PRICE[plan];
  const orderId = makeOrderId("onetime");
  const orderName = `layboad ${plan === "pro" ? "Pro" : "Basic"} 1개월권`;

  const TossPayments = await loadTossSdk();
  const toss = TossPayments(clientKey);
  const payment = toss.payment({ customerKey: user.id });

  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: amount },
    orderId,
    orderName,
    successUrl: `${window.location.origin}/billing/onetime-success?plan=${plan}`,
    failUrl: `${window.location.origin}/billing/fail`,
    customerEmail: user.email ?? undefined,
    customerName: user.email?.split("@")[0] ?? undefined,
  });
}

// 구독 해지 (+ 마지막 결제 환불). 서버에서 토큰 검증 후 토스 취소 호출.
export async function cancelSubscription(): Promise<{ ok: boolean; periodEnd?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { window.location.href = "/login"; return { ok: false }; }
  const r = await fetch("/billing/cancel", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, periodEnd: d.periodEnd } : { ok: false, error: d.error };
}
