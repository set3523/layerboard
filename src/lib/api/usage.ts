// src/lib/api/usage.ts
import { supabase } from "../supabase";

export type Plan = "basic" | "pro" | "enterprise";

const GB = 1024 * 1024 * 1024;

// 요금제별 저장 한도(바이트). pricing 페이지 기준.
export const PLAN_LIMITS: Record<Plan, number> = {
  basic: 1 * GB,
  pro: 20 * GB,
  enterprise: Number.POSITIVE_INFINITY,
};

// 요금제별 동시 학생(방 정원) 수
export const PLAN_STUDENT_CAP: Record<Plan, number> = {
  basic: 3,
  pro: 10,
  enterprise: 50,
};
export const getPlanStudentCap = (plan: Plan = "basic"): number =>
  PLAN_STUDENT_CAP[plan] ?? PLAN_STUDENT_CAP.basic;

// 현재 로그인 계정의 총 사용량(바이트) = DB(이벤트+필기 스냅샷) + Storage(교재/캡처) 합산.
// RPC(get_host_usage)가 없으면 0으로 폴백 → 게이트가 막지 않음(안전).
export const getHostUsage = async (): Promise<number> => {
  const { data, error } = await supabase.rpc("get_host_usage");
  if (error) {
    console.warn("사용량 조회 실패(용량 게이트 비활성):", error.message);
    return 0;
  }
  return Number(data) || 0;
};

// 계정 요금제. profiles에서 매번 최신값 읽음 (캐시 제거 — 업그레이드 즉시 반영).
export const getHostPlan = async (): Promise<Plan> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return "basic";
    const { data } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
    const p = (data?.plan as Plan) || "basic";
    return p in PLAN_LIMITS ? p : "basic";
  } catch {
    return "basic";
  }
};

export const getPlanLimit = (plan: Plan = "basic"): number =>
  PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;

export interface UsageSummary {
  usedBytes: number;
  limitBytes: number;
  percent: number; // 0~100 (무제한이면 0)
  plan: Plan;
}

// 대시보드 게이지용 요약
export const getUsageSummary = async (): Promise<UsageSummary> => {
  const [usedBytes, plan] = await Promise.all([getHostUsage(), getHostPlan()]);
  const limitBytes = getPlanLimit(plan);
  const percent = limitBytes === Number.POSITIVE_INFINITY ? 0 : Math.min(100, Math.round((usedBytes / limitBytes) * 100));
  return { usedBytes, limitBytes, percent, plan };
};

// 아직 저장 여유가 있는지 (요금제 한도 반영)
export const canStore = async (): Promise<boolean> => {
  const { usedBytes, limitBytes } = await getUsageSummary();
  return usedBytes < limitBytes;
};

// 바이트를 사람이 읽기 좋은 단위로
export const formatBytes = (bytes: number): string => {
  if (!isFinite(bytes)) return "무제한";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

// ── 계정/구독 상태 (무료체험 + 구독) ─────────────────────────────
export interface AccountStatus {
  plan: Plan;
  status: string;                // none | trialing | active | past_due | canceled
  trialEndsAt: string | null;
  trialDaysLeft: number | null;  // null = 체험 시작 전(첫 방 생성 전)
  periodEndsAt: string | null;   // 유료 구독 만료일 (해지해도 이 날까지 이용)
  pastDueDaysLeft: number | null; // 결제 실패 유예 남은 일수 (>0 이면 유예 중·접근 허용)
  paid: boolean;                 // 결제 기반 접근 중 (active / 해지-기간내 / 연체-유예중)
  expired: boolean;              // 체험·구독 모두 끝남 → 사용 차단 대상
}

const PAST_DUE_GRACE_DAYS = 3;

// 현재 로그인 계정의 체험/구독 상태.
// 컬럼/테이블이 아직 없거나 미로그인이면 안전하게 빈 상태(차단 안 함) 반환.
export const getAccountStatus = async (): Promise<AccountStatus> => {
  const empty: AccountStatus = {
    plan: "basic", status: "none", trialEndsAt: null,
    trialDaysLeft: null, periodEndsAt: null, pastDueDaysLeft: null, paid: false, expired: false,
  };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return empty;
    const { data } = await supabase
      .from("profiles")
      .select("plan, status, trial_ends_at, current_period_end, past_due_since")
      .eq("id", user.id)
      .maybeSingle();

    const plan = (data?.plan as Plan) ?? "basic";
    const status = (data?.status as string) ?? "none";
    const trialEndsAt = (data?.trial_ends_at as string) ?? null;
    const periodEndsAt = (data?.current_period_end as string) ?? null;
    const pastDueSince = (data?.past_due_since as string) ?? null;

    const now = Date.now();
    const trialEnd = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
    const periodEnd = periodEndsAt ? new Date(periodEndsAt).getTime() : null;
    const pastDueStart = pastDueSince ? new Date(pastDueSince).getTime() : null;

    const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / 86_400_000)) : null;
    const pastDueDaysLeft = (status === "past_due" && pastDueStart)
      ? Math.max(0, PAST_DUE_GRACE_DAYS - Math.floor((now - pastDueStart) / 86_400_000))
      : null;

    const trialActive = !!trialEnd && trialEnd > now;
    const subActive = status === "active";                                                // 정기구독 중
    const canceledWithinPeriod = status === "canceled" && !!periodEnd && periodEnd > now;  // 해지했지만 기간 남음
    const pastDueActive = status === "past_due" && (pastDueDaysLeft ?? 0) > 0;              // 연체지만 유예 중

    const paid = subActive || canceledWithinPeriod || pastDueActive;  // 결제 기반 접근 중
    const everEngaged = !!trialEnd || status !== "none";   // 체험·구독 시작 이력
    const expired = everEngaged && !paid && !trialActive;  // 접근 불가(차단 대상)

    return { plan, status, trialEndsAt, trialDaysLeft, periodEndsAt, pastDueDaysLeft, paid, expired };
  } catch {
    return empty;
  }
};
