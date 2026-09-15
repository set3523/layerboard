"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, LayoutDashboard, BookOpen, CreditCard, Settings,
  LogOut, Search, MoreVertical, ExternalLink, Users, Loader2, Trash2, Database, Clock
} from "lucide-react";
import Link from "next/link";

// ✨ 우리가 만든 백엔드 통신 모듈 불러오기!
import { getCurrentUser, signOut } from "@/lib/api/auth";
import { createRoom, getTeacherRooms, deleteRoom } from "@/lib/api/rooms";
import { getUsageSummary, formatBytes, UsageSummary, getAccountStatus, AccountStatus } from "@/lib/api/usage";
import { useSingleSession } from "@/hooks/useSingleSession";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  useSingleSession(); // 🔒 단일 활성 세션(다른 기기 로그인 시 이 기기 로그아웃)

  // 상태 관리
  const [userName, setUserName] = useState("선생님");
  const [userId, setUserId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<any[]>([]); // 진짜 DB 방 목록
  const [isLoading, setIsLoading] = useState(true); // 최초 로딩 상태
  const [isCreating, setIsCreating] = useState(false); // 방 생성 중 상태
  const [usage, setUsage] = useState<UsageSummary | null>(null); // 저장 용량 사용량
  const [account, setAccount] = useState<AccountStatus | null>(null); // 무료체험/구독 상태
  const [giftCode, setGiftCode] = useState("");
  const [giftMsg, setGiftMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  // 🎁 선물코드 등록(redeem) → 이용기간 30일 추가
  const handleRedeem = async () => {
    const code = giftCode.trim().toUpperCase();
    if (!code) return;
    setRedeeming(true); setGiftMsg(null);
    try {
      const { data, error } = await supabase.rpc("redeem_gift", { p_code: code });
      if (error) { setGiftMsg({ type: "err", text: "등록 실패. 잠시 후 다시 시도해 주세요." }); return; }
      if (data === "ok") {
        setGiftMsg({ type: "ok", text: "코드가 등록됐어요! 이용기간이 30일 추가됐습니다." });
        setGiftCode("");
        getAccountStatus().then(setAccount).catch(() => {});
      } else if (data === "used") setGiftMsg({ type: "err", text: "이미 사용된 코드예요." });
      else setGiftMsg({ type: "err", text: "존재하지 않는 코드예요." });
    } catch {
      setGiftMsg({ type: "err", text: "네트워크 오류가 발생했어요." });
    } finally { setRedeeming(false); }
  };


  // 1️⃣ 페이지가 열릴 때: 로그인 검사 & 내 수업 목록 불러오기
  useEffect(() => {
    async function loadDashboard() {
      try {
        // 현재 로그인한 유저 정보 가져오기
        const user = await getCurrentUser();
        
        // 로그인 안 했으면 로그인 창으로 쫓아냄
        if (!user) {
          router.push("/login");
          return;
        }

        setUserId(user.id);
        // 이메일 앞자리를 임시 이름으로 사용 (나중에 profiles 테이블 연동 시 수정 가능)
        setUserName(user.email?.split("@")[0] || "선생님");

        // 선생님이 만든 방 목록 가져오기
        const myRooms = await getTeacherRooms(user.id);
        setRooms(myRooms || []);

        // 저장 용량 사용량 (DB + Storage 합산) — 게이지용
        getUsageSummary().then(setUsage).catch(() => {});

        // 무료체험/구독 상태 — 배너 & 방 생성 게이트용
        getAccountStatus().then(setAccount).catch(() => {});

      } catch (error) {
        console.error("데이터 로딩 에러:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  // 2️⃣ "새로운 교실 만들기" 버튼 클릭 시
  const handleCreateRoom = async () => {
    if (!userId) return;

    // 무료체험 종료 & 미결제면 → 구독 페이지로 보냄 (방 생성 차단)
    if (account?.expired) {
      router.push("/pricing");
      return;
    }

    setIsCreating(true);

    try {
      // 진짜 DB에 방 생성!
      const newRoom = await createRoom(userId);
      
      // 생성이 완료되면 발급받은 코드(newRoom.code)를 가지고 칠판으로 이동!
      router.push(`/room/${newRoom.code}?role=teacher&name=${encodeURIComponent(userName)}`);
    } catch (error) {
      alert("교실을 생성하는 중 문제가 발생했습니다.");
      setIsCreating(false);
    }
  };

  // 3️⃣ "로그아웃" 버튼 클릭 시
  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const handleDeleteRoom = async (roomId: string) => {
    // 실수로 누를 수 있으니 한 번 물어보기
    const isConfirm = window.confirm("정말 이 교실을 삭제하시겠습니까?\n(관련된 모든 필기 데이터가 영구적으로 삭제됩니다.)");
    if (!isConfirm) return;

    try {
      // DB에서 진짜 삭제!
      await deleteRoom(roomId);
      
      // 화면에서도 즉시 지워주기 (새로고침 안 해도 됨)
      setRooms((prevRooms) => prevRooms.filter((room) => room.id !== roomId));
    } catch (error) {
      alert("교실을 삭제하는 중 문제가 발생했습니다.");
    }
  };

  // 구독 해지 (환불 없음 — 결제한 기간 끝까지 이용 후 자동결제 중단)
  const handleCancel = async () => {
    if (!window.confirm("구독을 해지하시겠어요?\n결제하신 기간까지는 그대로 이용하고, 이후 자동결제가 중단됩니다. (환불은 없습니다)")) return;
    try {
      const { cancelSubscription } = await import("@/lib/billingClient");
      const res = await cancelSubscription();
      if (res.ok) {
        alert(res.periodEnd ? `구독이 해지되었습니다. ${res.periodEnd}까지 이용 가능합니다.` : "구독이 해지되었습니다.");
        window.location.reload();
      } else {
        alert(res.error || "해지 처리에 실패했습니다.");
      }
    } catch {
      alert("해지 처리 중 오류가 발생했습니다.");
    }
  };

  // 결제 실패(past_due) → 결제수단 업데이트 = 카드 재등록 + 재청구
  const handleUpdatePayment = async () => {
    const { startSubscription } = await import("@/lib/billingClient");
    await startSubscription(account?.plan === "pro" ? "pro" : "basic");
  };
  
  // ⏳ 로딩 중일 때 보여줄 화면
  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center font-sans text-gray-900 selection:bg-leaf-100">
        <Loader2 size={48} className="animate-spin text-leaf-600 mb-4" />
        <p className="text-gray-500 font-medium">대시보드를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans text-gray-900 selection:bg-leaf-100">
      
      {/* 🟢 좌측 사이드바 */}
      <aside className="w-64 gg-glass border-r border-gray-200 flex flex-col hidden md:flex">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-leaf-600 hover:opacity-80 transition-opacity" title="메인으로">
            <div className="w-8 h-8 bg-leaf-600 rounded-lg flex items-center justify-center text-white">
              <BookOpen size={18} />
            </div>
            <span>layboad</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem icon={<LayoutDashboard size={20} />} label="대시보드" active />
          <NavItem icon={<BookOpen size={20} />} label="내 교재함" />
          <NavItem icon={<CreditCard size={20} />} label="구독 및 결제" href="/pricing" />
          <NavItem icon={<Settings size={20} />} label="환경 설정" />
        </nav>

        <div className="p-4 border-t border-gray-100">
          {/* ✨ 로그아웃 기능 연결 */}
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
            <LogOut size={20} /> 로그아웃
          </button>
        </div>
      </aside>

      {/* 🟢 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 gg-glass border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="relative w-full max-w-sm group">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-leaf-500 transition-colors" />
            <input 
              type="text" 
              placeholder="방 코드 검색" 
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent border focus:bg-white focus:border-leaf-500 rounded-xl text-sm outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900">{userName} 선생님</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-leaf-600 to-leaf-400 border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm">
              {userName[0]}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-5xl mx-auto">
          <section className="mb-10">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">반갑습니다, {userName}님! 👋</h1>
            <p className="text-gray-500 font-medium">오늘도 학생들과 즐거운 수업 되시길 바랍니다.</p>
          </section>

          {/* 🔴 결제 실패(past_due) 경고 — 유예 기간 */}
          {account?.status === "past_due" && (
            <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
              <p className="text-sm font-semibold text-red-700">
                ⚠️ 결제에 실패했어요. <span className="font-extrabold">{account.pastDueDaysLeft ?? 0}일</span> 안에 결제수단을 업데이트하지 않으면 구독이 자동 해지됩니다.
              </p>
              <button onClick={handleUpdatePayment} className="shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors">
                결제수단 업데이트
              </button>
            </div>
          )}

          {/* 🟢 무료체험 / 구독 상태 배너 */}
          {account && !account.paid && (
            account.expired ? (
              <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
                <p className="text-sm font-semibold text-red-700">
                  무료체험이 종료되었어요. 구독하면 모든 교실을 계속 사용할 수 있어요.
                </p>
                <Link href="/pricing" className="gg-btn gg-btn--primary gg-btn--sm shrink-0">
                  구독하고 계속하기
                </Link>
              </div>
            ) : account.trialDaysLeft !== null ? (
              <div className="mb-10 flex items-center gap-3 gg-glass gg-glass--tint px-5 py-4">
                <Clock size={20} className="text-leaf-500 shrink-0" />
                <p className="text-sm font-semibold text-leaf-800">
                  무료체험 <span className="font-extrabold text-leaf-600">{account.trialDaysLeft}일</span> 남았어요.
                  {account.trialDaysLeft <= 7 && " 마음에 드시면 구독으로 이어가세요!"}
                </p>
              </div>
            ) : (
              <div className="mb-10 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4">
                <Clock size={20} className="text-gray-400 shrink-0" />
                <p className="text-sm font-medium text-gray-600">
                  첫 교실을 만들면 <span className="font-bold text-gray-800">30일 무료체험</span>이 시작돼요.
                </p>
              </div>
            )
          )}

          {/* 🎁 선물코드 등록 */}
          <div className="mb-12 gg-glass p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">🎁 선물코드 등록</h3>
            <p className="text-sm text-gray-500 mb-4">구매했거나 선물받은 1개월권 코드를 입력하면 이용기간이 30일 추가돼요.</p>
            <div className="flex gap-2">
              <input
                value={giftCode}
                onChange={(e) => setGiftCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRedeem(); }}
                placeholder="LB-XXXX-XXXX"
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono tracking-widest uppercase outline-none focus:border-leaf-500 focus:bg-white transition-all"
              />
              <button onClick={handleRedeem} disabled={redeeming || !giftCode.trim()} className="gg-btn gg-btn--primary gg-btn--sm disabled:opacity-40">
                {redeeming ? "등록 중..." : "등록"}
              </button>
            </div>
            {giftMsg && (
              <p className={`text-xs font-semibold mt-2 ${giftMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>{giftMsg.text}</p>
            )}
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="gg-glass p-8">
              <div className="w-12 h-12 bg-leaf-100 text-leaf-600 rounded-2xl flex items-center justify-center mb-6">
                <Plus size={28} />
              </div>
              <h3 className="text-xl font-bold mb-2">새로운 교실 만들기</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                클릭 한 번으로 즉시 수업을 시작할 수 있는 고유 주소를 생성합니다.
              </p>
              {/* ✨ 방 생성 기능 연결 */}
              <button 
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="gg-btn gg-btn--primary gg-btn--block gg-drop disabled:opacity-70"
              >
                {isCreating ? <><Loader2 size={20} className="animate-spin" /> 생성 중...</> : "교실 입장하기"}
              </button>
            </div>
            {/* 우측 카드: 저장 용량 사용량 게이지 */}
            <div className="gg-glass p-8 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <Database size={28} />
                </div>
                <span className="text-xs font-extrabold uppercase tracking-wide px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
                  {usage ? usage.plan : "..."} 플랜
                </span>
              </div>
              <h3 className="text-xl font-bold mb-2">저장 용량</h3>
              {usage ? (
                <>
                  <p className="text-gray-500 text-sm mb-4">
                    <span className="font-bold text-gray-800">{formatBytes(usage.usedBytes)}</span>
                    {" / "}
                    {usage.limitBytes === Infinity ? "무제한" : formatBytes(usage.limitBytes)} 사용 중
                  </p>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${usage.percent >= 90 ? "bg-red-500" : usage.percent >= 70 ? "bg-orange-400" : "bg-emerald-500"}`}
                      style={{ width: `${usage.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 font-semibold">{usage.percent}% 사용 중</p>
                  {(usage.plan === "basic" || usage.percent >= 90) && (
                    <Link href="/pricing" className="mt-4 text-sm font-bold text-leaf-600 hover:underline">
                      {usage.percent >= 90 ? "용량이 거의 찼어요 — 업그레이드 →" : "더 큰 그룹·용량이 필요하면 업그레이드 →"}
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-gray-400 text-sm">용량 계산 중...</p>
              )}
              {account?.status === "active" && (
                <button
                  onClick={handleCancel}
                  className="mt-5 self-start text-xs font-semibold text-gray-400 hover:text-red-600 transition-colors"
                >
                  구독 해지
                </button>
              )}
              {account?.status === "canceled" && account.periodEndsAt && (
                <p className="mt-5 self-start text-xs text-gray-400">
                  구독 해지됨 · {account.periodEndsAt}까지 이용 가능
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold text-gray-900">내 교실 목록</h2>
            </div>
            
            {/* ✨ 진짜 DB에서 불러온 방 목록 렌더링 */}
            {rooms.length === 0 ? (
              <div className="gg-glass p-10 text-center border border-dashed border-gray-300">
                <p className="text-gray-500 font-medium">아직 생성된 교실이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {rooms.map((room) => (
                  <div key={room.id} className="gg-glass p-5 flex items-center justify-between hover:border-leaf-300 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center group-hover:bg-leaf-50 group-hover:text-leaf-500 transition-colors">
                        <BookOpen size={24} />
                      </div>
                      <div>
                        {/* 임시 방 이름: 코드 활용 */}
                        <h4 className="font-bold text-gray-900">클래스 {room.code}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 font-medium">
                          <span>{new Date(room.created_at).toLocaleDateString()} 생성</span>
                          <span>•</span>
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono font-bold">{room.code}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* ✨ 발급된 코드로 화이트보드 입장하기 */}
                      <button 
                        onClick={() => router.push(`/room/${room.code}?role=teacher&name=${userName}`)}
                        className="p-2.5 text-leaf-600 hover:bg-leaf-50 rounded-xl transition-colors"
                        title="입장하기"
                      >
                        <ExternalLink size={20} />
                      </button>

                      {/* ✨ 방 삭제하기 버튼 */}
                      <button 
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                        title="삭제하기"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false, href = "#" }: { icon: React.ReactNode, label: string, active?: boolean, href?: string }) {
  // 1. 공통 스타일 정의
  const baseStyle = `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
    active ? "bg-leaf-50 text-leaf-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
  }`;

  // 2. href가 '#'이면 그냥 div(링크 없음), 아니면 Link(이동 가능)
  if (href === "#") {
    return (
      <div className={baseStyle}>
        {icon} {label}
      </div>
    );
  }

  return (
    <Link href={href} className={baseStyle}>
      {icon} {label}
    </Link>
  );
}