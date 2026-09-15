"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MonitorPlay, Users, Sparkles, BookOpen, LogOut } from "lucide-react";
import Link from "next/link";
import Footer from "@/components/Footer";
import { getCurrentUser, signOut } from "@/lib/api/auth";

export default function LandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [guide, setGuide] = useState<"android" | "ios" | null>(null);
  const [user, setUser] = useState<any>(null);          // 로그인 유저 (null = 비로그인)
  const [authChecked, setAuthChecked] = useState(false); // 인증 확인 완료 (버튼 깜빡임 방지)

  // 로그인 상태 확인 → 우측 상단 버튼 전환용
  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {}).finally(() => setAuthChecked(true));
  }, []);

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    setUser(null);
  };

  // 👨‍🎓 학생 입장 처리
  const handleStudentJoin = (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return alert("초대 코드를 입력해주세요!");
    
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    router.push(`/join/${code}`);
  };

  return (
    <div className="min-h-screen font-sans text-gray-900 selection:bg-leaf-100">
      
      {/* 🟢 네비게이션 바 */}
      <header className="fixed top-0 w-full gg-glass z-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-leaf-600">
            <MonitorPlay size={24} />
            <span>layboad</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              요금제
            </Link>
            {authChecked && (user ? (
              <>
                <Link href="/dashboard" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                  대시보드
                </Link>
                <button onClick={handleLogout} className="gg-btn gg-btn--ghost gg-btn--sm">
                  <LogOut size={16} /> 로그아웃
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                  로그인
                </Link>
                <Link href="/login" className="gg-btn gg-btn--primary gg-btn--sm">
                  무료로 시작하기
                </Link>
              </>
            ))}
          </nav>
        </div>
      </header>

      {/* 🟢 메인 히어로 섹션 */}
      <main className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center mt-12 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-leaf-50 text-leaf-600 text-sm font-bold mb-6">
            <Sparkles size={16} />
            <span>온라인 과외를 위한 가장 완벽한 솔루션</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
            PDF 교재 위에 펼쳐지는 <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-leaf-600 to-leaf-400">실시간 마법 칠판</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            무거운 프로그램 설치 없이, 브라우저 클릭 한 번으로 나만의 교실을 만드세요. <br />
            배경과 분리된 스마트 풀이 단계로 학생의 이해도를 200% 끌어올립니다.
          </p>

          {/* 선생님 시작 & 학생 입장 폼 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-xl mx-auto">
            
            <button
              onClick={() => router.push(user ? "/dashboard" : "/login")}
              className="gg-btn gg-btn--primary gg-btn--lg gg-drop w-full sm:w-auto text-lg"
            >
              {user ? "내 교실로 가기" : "선생님으로 시작하기"} <ArrowRight size={20} />
            </button>

            <form onSubmit={handleStudentJoin} className="w-full sm:w-auto flex relative group">
              <input 
                type="text" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="학생 초대 코드 입력" 
                className="w-full sm:w-64 pl-5 pr-14 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-leaf-500 focus:bg-white transition-all text-lg uppercase font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans"
                maxLength={6}
              />
              <button 
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gray-900 hover:bg-black text-white rounded-xl transition-colors"
                title="입장하기"
              >
                <ArrowRight size={20} />
              </button>
            </form>

          </div>
        </div>

        {/* 🟢 기능 하이라이트 섹션 */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
          <div className="p-8 gg-glass">
            <div className="w-12 h-12 bg-leaf-100 text-leaf-600 rounded-xl flex items-center justify-center mb-6">
              <BookOpen size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">초고속 PDF 로딩</h3>
            <p className="text-gray-600 leading-relaxed">
              수백 페이지의 교재도 기다림 없이 즉시 띄웁니다. 스마트 캐싱으로 깜빡임 없는 페이지 넘김을 경험하세요.
            </p>
          </div>
          <div className="p-8 gg-glass">
            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-6">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">학생 필기 완벽 통제</h3>
            <p className="text-gray-600 leading-relaxed">
              수업에 방해되는 학생의 낙서를 선생님이 클릭 한 번으로 가리거나 투명도를 조절할 수 있습니다.
            </p>
          </div>
          <div className="p-8 gg-glass">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
              <MonitorPlay size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">스마트 풀이 레이어</h3>
            <p className="text-gray-600 leading-relaxed">
              복잡한 수학 문제도 풀이 단계별로 나누어 저장하고, 원할 때마다 눈알 버튼으로 끄고 켤 수 있습니다.
            </p>
          </div>
        </div>

        {/* 🟢 앱처럼 설치해서 쓰기 안내 */}
        <section id="install" className="max-w-3xl mx-auto mt-28 mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-leaf-50 text-leaf-600 text-sm font-bold mb-5">
            태블릿·폰에서 더 편하게 📱
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">앱처럼 설치해서 전체화면으로</h2>
          <p className="text-gray-500 leading-relaxed mb-8 max-w-xl mx-auto">
            layboad는 설치 없이 바로 쓰는 웹 칠판이에요. 다만 태블릿·폰이라면 <b className="text-gray-700">홈 화면에 추가</b>해두면
            주소창·뒤로가기 같은 브라우저 화면이 사라져 <b className="text-gray-700">전체화면</b>으로 깔끔하고,
            수업 중 실수로 뒤로가기를 누를 일도 없어요.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => setGuide(guide === "android" ? null : "android")}
              className={`gg-btn ${guide === "android" ? "gg-btn--primary" : "gg-btn--ghost"}`}
            >
              🤖 안드로이드 사용법
            </button>
            <button
              onClick={() => setGuide(guide === "ios" ? null : "ios")}
              className={`gg-btn ${guide === "ios" ? "gg-btn--primary" : "gg-btn--ghost"}`}
            >
              🍎 아이폰·아이패드 사용법
            </button>
          </div>

          {guide === "android" && (
            <div className="mt-6 text-left gg-glass p-6 max-w-xl mx-auto animate-in fade-in slide-in-from-top-2 duration-300">
              <ol className="space-y-3 text-gray-700 font-medium">
                <li><span className="font-extrabold text-leaf-600">1.</span> 크롬(Chrome)으로 이 페이지를 엽니다.</li>
                <li><span className="font-extrabold text-leaf-600">2.</span> 오른쪽 위 <b>⋮</b> 메뉴를 누릅니다.</li>
                <li><span className="font-extrabold text-leaf-600">3.</span> <b>&quot;홈 화면에 추가&quot;</b> 또는 <b>&quot;앱 설치&quot;</b>를 선택합니다.</li>
                <li><span className="font-extrabold text-leaf-600">4.</span> 홈 화면에 생긴 <b>layboad</b> 아이콘으로 실행하면 전체화면 앱처럼 열려요.</li>
              </ol>
            </div>
          )}

          {guide === "ios" && (
            <div className="mt-6 text-left gg-glass p-6 max-w-xl mx-auto animate-in fade-in slide-in-from-top-2 duration-300">
              <ol className="space-y-3 text-gray-700 font-medium">
                <li><span className="font-extrabold text-leaf-600">1.</span> 반드시 <b>사파리(Safari)</b>로 이 페이지를 엽니다. <span className="text-gray-400">(크롬·인앱 브라우저는 안 돼요)</span></li>
                <li><span className="font-extrabold text-leaf-600">2.</span> 아래(또는 위) <b>공유 버튼</b> <span className="text-gray-400">(네모에 ↑ 화살표)</span>을 누릅니다.</li>
                <li><span className="font-extrabold text-leaf-600">3.</span> <b>&quot;홈 화면에 추가&quot;</b>를 선택합니다.</li>
                <li><span className="font-extrabold text-leaf-600">4.</span> 홈 화면 <b>layboad</b> 아이콘으로 실행하면 전체화면으로 열려요.</li>
              </ol>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}