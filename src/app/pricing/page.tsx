"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, MonitorPlay, Sparkles, Clock, LogOut } from "lucide-react";
import Link from "next/link";
import Footer from "@/components/Footer";
import { getCurrentUser, signOut } from "@/lib/api/auth";
import { getAccountStatus, AccountStatus } from "@/lib/api/usage";

export default function PricingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [billingMode, setBillingMode] = useState<"recurring" | "onetime">("recurring"); // 정기 / 단건(선물)

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {}).finally(() => setAuthChecked(true));
    getAccountStatus().then(setAccount).catch(() => {});
  }, []);

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    setUser(null);
  };

  const handlePlanSelect = async (planName: string) => {
    const planKey = planName === "Pro" ? "pro" : "basic";

    // 🎁 단건(1개월권/선물) 모드 — 로그인 필요, 자동갱신 없는 일반결제 → 코드 발급
    if (billingMode === "onetime") {
      if (!user) { router.push("/login"); return; }
      const { startOneTime } = await import("@/lib/billingClient");
      await startOneTime(planKey);
      return;
    }

    // 정기결제 모드 (기존 로직)
    if (planName === "Pro") {
      const { startSubscription } = await import("@/lib/billingClient");
      await startSubscription("pro");
      return;
    }
    if (!user) { router.push("/login"); return; }              // 비로그인 → 가입/로그인
    if (account?.expired) {                                    // 체험 끝 → Basic 결제
      const { startSubscription } = await import("@/lib/billingClient");
      await startSubscription("basic");
      return;
    }
    router.push("/dashboard");                                 // 체험 중/이용 중 → 대시보드
  };

  return (
    <div className="min-h-screen text-gray-900 font-sans selection:bg-leaf-100">

      {/* 🟢 상단 네비게이션 바 */}
      <header className="gg-glass border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-leaf-600">
            <MonitorPlay size={24} />
            <span>layboad</span>
          </Link>
          {authChecked && (user ? (
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                대시보드
              </Link>
              <button onClick={handleLogout} className="gg-btn gg-btn--ghost gg-btn--sm">
                <LogOut size={16} /> 로그아웃
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              로그인
            </Link>
          ))}
        </div>
      </header>

      {/* 🟢 메인 콘텐츠 */}
      <main className="max-w-5xl mx-auto px-6 py-20 text-center">

        {/* 타이틀 */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            수업에만 집중하세요, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-leaf-600 to-leaf-400">합리적인 가격</span>은 저희가 맡을게요.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto font-medium">
            설치 없이 바로 시작. 필요한 만큼만 선택하고 언제든 변경하세요.
          </p>
        </div>

        {/* 30일 무료 체험 배너 */}
        <div className="max-w-2xl mx-auto mb-12 gg-glass gg-glass--tint p-4 flex items-center justify-center gap-3 animate-in fade-in duration-700">
          <Clock className="text-leaf-500" size={24} />
          <p className="text-leaf-800 font-semibold text-sm md:text-base">
            모든 방장에게 <span className="font-bold text-leaf-600">첫 수업 시작일로부터 30일 무료 체험</span>을 제공합니다.
          </p>
        </div>

        {/* 정기 / 단건(선물) 토글 */}
        <div className="inline-flex items-center bg-gray-100 rounded-full p-1 mb-10">
          <button onClick={() => setBillingMode("recurring")} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${billingMode === "recurring" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>정기결제</button>
          <button onClick={() => setBillingMode("onetime")} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${billingMode === "onetime" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>🎁 단건 · 선물</button>
        </div>

        {/* 요금제 카드 (2티어) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start max-w-3xl mx-auto">

          {/* Basic */}
          <div className="gg-glass p-8 flex flex-col justify-between h-[560px] hover:border-gray-300 transition-all">
            <div>
              <h3 className="text-lg font-bold text-gray-600 text-left">Basic</h3>
              <p className="text-sm text-gray-400 text-left mt-1">1:1 ~ 1:3 소규모 수업·방장용 플랜</p>
              <div className="text-left my-6">
                <span className="text-4xl font-extrabold">₩9,900</span>
                <span className="text-gray-400 text-sm font-medium">{billingMode === "onetime" ? " / 1개월권" : " / 월"}</span>
              </div>
              <hr className="border-gray-100 my-6" />
              <ul className="space-y-4 text-left">
                <FeatureItem text="동시 수업 학생 수 3명 (1:1 ~ 1:3)" />
                <FeatureItem text="수업 진행 시간 무제한" />
                <FeatureItem text="개설 가능 교실 무제한" />
                <FeatureItem text="교재 저장 클라우드 1GB" />
              </ul>
            </div>
            <div className="mt-6">
              <button
                onClick={() => handlePlanSelect("Basic")}
                className="gg-btn gg-btn--ghost gg-btn--block"
              >
                {billingMode === "onetime"
                  ? "Basic 1개월권 구매"
                  : !user
                  ? "30일 무료로 시작하기"
                  : account?.expired
                  ? "Basic 구독하기"
                  : "대시보드로 가기"}
              </button>
              {user && account && !account.paid && !account.expired && account.trialDaysLeft !== null && (
                <p className="text-xs text-leaf-600 font-semibold mt-2 text-center">무료체험 {account.trialDaysLeft}일 남았어요</p>
              )}
              {user && account?.expired && (
                <p className="text-xs text-red-500 font-semibold mt-2 text-center">무료체험이 끝났어요 — 구독하고 계속 사용하세요</p>
              )}
            </div>
          </div>

          {/* Pro */}
          <div className="gg-glass p-8 border-2 border-leaf-500 flex flex-col justify-between h-[560px] relative">
            <div className="absolute top-0 right-8 -translate-y-1/2 bg-gradient-to-r from-leaf-600 to-leaf-400 text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-md flex items-center gap-1">
              <Sparkles size={12} /> MOST POPULAR
            </div>
            <div>
              <h3 className="text-lg font-bold text-leaf-600 text-left">Pro</h3>
              <p className="text-sm text-gray-400 text-left mt-1">그룹 수업 · 소규모 학원반 방장</p>
              <div className="text-left my-6">
                <span className="text-4xl font-extrabold">₩29,000</span>
                <span className="text-gray-400 text-sm font-medium">{billingMode === "onetime" ? " / 1개월권" : " / 월"}</span>
              </div>
              <hr className="border-gray-100 my-6" />
              <ul className="space-y-4 text-left">
                <FeatureItem text="동시 수업 학생 수 10명 (그룹 수업)" highlighted />
                <FeatureItem text="수업 진행 시간 무제한" highlighted />
                <FeatureItem text="개설 가능 교실 무제한" highlighted />
                <FeatureItem text="교재 저장 클라우드 20GB" highlighted />
              </ul>
            </div>
            <button
              onClick={() => handlePlanSelect("Pro")}
              className="gg-btn gg-btn--primary gg-btn--block gg-drop mt-6"
            >
              {billingMode === "onetime" ? "Pro 1개월권 구매" : "Pro 플랜 시작하기"}
            </button>
          </div>

        </div>

        <p className="mt-12 text-sm text-gray-400 font-medium">
          {billingMode === "onetime"
            ? "단건은 1회성 결제로 자동갱신되지 않습니다. 구매 후 발급된 코드를 계정에 등록하면 30일이 추가돼요."
            : "결제는 월 단위 자동결제이며, 언제든 해지할 수 있습니다."}
        </p>

      </main>
      <Footer />
    </div>
  );
}

// 체크마크 아이템
function FeatureItem({ text, highlighted = false }: { text: string; highlighted?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm font-medium text-gray-600">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${highlighted ? "bg-leaf-100 text-leaf-600" : "bg-gray-100 text-gray-400"}`}>
        <Check size={12} strokeWidth={3} />
      </div>
      <span>{text}</span>
    </li>
  );
}
