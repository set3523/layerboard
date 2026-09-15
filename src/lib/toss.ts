// src/lib/toss.ts  ⚠️ 서버 전용 — 절대 클라이언트에서 import 하지 마세요 (시크릿 키 노출 금지)
const TOSS_API = "https://api.tosspayments.com/v1";

function authHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY || "";
  // 시크릿 키 + ":" 를 base64 (Basic 인증)
  return "Basic " + Buffer.from(secret + ":").toString("base64");
}

// authKey + customerKey → 빌링키 발급
export async function issueBillingKey(authKey: string, customerKey: string) {
  const res = await fetch(`${TOSS_API}/billing/authorizations/issue`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ authKey, customerKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "빌링키 발급 실패");
  return data; // { billingKey, customerKey, card, ... }
}

// 빌링키로 결제 승인(청구)
export async function chargeWithBillingKey(params: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
}) {
  const { billingKey, ...body } = params;
  const res = await fetch(`${TOSS_API}/billing/${billingKey}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "결제 승인 실패");
  return data; // Payment 객체 (paymentKey 등)
}

// 결제 취소(환불). cancelAmount 없으면 전액 취소.
export async function cancelPayment(paymentKey: string, cancelReason: string, cancelAmount?: number) {
  const body: Record<string, unknown> = { cancelReason };
  if (cancelAmount != null) body.cancelAmount = cancelAmount;
  const res = await fetch(`${TOSS_API}/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "결제 취소 실패");
  return data; // 취소된 Payment 객체
}

// 일반결제(단건) 최종 승인. requestPayment 성공 후 successUrl에서 받은 paymentKey/orderId/amount로 승인.
export async function confirmPayment(paymentKey: string, orderId: string, amount: number) {
  const res = await fetch(`${TOSS_API}/payments/confirm`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "결제 승인 실패");
  return data; // 승인된 Payment 객체
}
