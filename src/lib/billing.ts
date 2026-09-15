// src/lib/billing.ts
import { Plan } from "./api/usage";

// 요금제별 월 정가(원). pricing 페이지 기준.
export const PLAN_PRICE: Record<Plan, number> = {
  basic: 9900,
  pro: 29000,
  enterprise: 0, // 별도 견적(영업)
};

const DAY = 1000 * 60 * 60 * 24;

export interface ProrationResult {
  chargeNow: number;     // 지금 즉시 청구할 금액(원)
  remainingDays: number; // 갱신일까지 남은 일수
  detail: string;        // 계산식 설명(영수증/디버그용)
}

/**
 * 업그레이드 시 '즉시 청구할 차액'을 일할(proration)로 계산.
 * 방식: 남은 기간만큼 (새요금 − 기존요금)을 비례 청구하고, 갱신일(periodEnd)은 그대로 유지.
 *  - 다운그레이드/동일가면 즉시 청구 0 (다음 갱신부터 새 요금 적용)
 *
 * 예) Basic(9,900) → Pro(29,000), 30일 주기 중 20일 남음
 *    (29,000 − 9,900) / 30 × 20 = 12,733 → 12,730원
 */
export function computeProration(params: {
  fromPlan: Plan;
  toPlan: Plan;
  periodEnd: Date;     // 현재 구독 갱신일
  periodDays?: number; // 한 주기 일수(기본 30)
  now?: Date;
}): ProrationResult {
  const periodDays = params.periodDays ?? 30;
  const now = params.now ?? new Date();

  const remainingDays = Math.max(
    0,
    Math.min(periodDays, Math.ceil((params.periodEnd.getTime() - now.getTime()) / DAY))
  );

  const fromPrice = PLAN_PRICE[params.fromPlan] ?? 0;
  const toPrice = PLAN_PRICE[params.toPlan] ?? 0;

  if (toPrice <= fromPrice) {
    return {
      chargeNow: 0,
      remainingDays,
      detail: "다운그레이드/동일가 — 즉시 청구 없음(다음 갱신부터 적용)",
    };
  }

  const dailyDiff = (toPrice - fromPrice) / periodDays;
  const chargeNow = Math.round((dailyDiff * remainingDays) / 10) * 10; // 10원 단위 반올림

  return {
    chargeNow,
    remainingDays,
    detail: `(${toPrice.toLocaleString()} − ${fromPrice.toLocaleString()}) / ${periodDays}일 × ${remainingDays}일 = ${chargeNow.toLocaleString()}원`,
  };
}

// 신규 구독(또는 무료체험 종료 후 첫 결제)은 일할 없이 정가 청구
export function firstChargeAmount(plan: Plan): number {
  return PLAN_PRICE[plan] ?? 0;
}

// 다음 갱신일 (오늘 + periodDays)
export function nextPeriodEnd(from: Date = new Date(), periodDays = 30): Date {
  return new Date(from.getTime() + periodDays * DAY);
}

// 고유 주문번호 (토스 orderId 용)
export function makeOrderId(prefix = "layboad"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
