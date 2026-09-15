import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import Footer from "@/components/Footer";

export const metadata = { title: "개인정보처리방침 — layboad" };

export default function Privacy() {
  return (
    <div className="min-h-screen text-gray-800 font-sans selection:bg-leaf-100">
      <header className="gg-glass border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-leaf-600"><MonitorPlay size={22} /> layboad</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-14 leading-relaxed text-[15px]">
        <h1 className="text-3xl font-extrabold mb-2">개인정보처리방침</h1>
        <p className="text-sm text-gray-400 mb-10">시행일: 2026년 7월 1일</p>
        <section className="space-y-6">
          <div><h2 className="text-lg font-bold mb-2">1. 수집하는 개인정보 항목</h2><p>회원가입 시 이메일, 유료 결제 시 결제 관련 정보(빌링키·결제 승인 정보)를 수집합니다. 카드번호 등 민감한 결제정보는 <b>토스페이먼츠</b>가 처리하며 회사는 저장하지 않습니다. 서비스 이용 과정에서 교실·필기 데이터가 저장됩니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">2. 이용 목적</h2><p>회원 식별 및 서비스 제공, 결제·정산, 문의 응대에 이용합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">3. 보유·이용 기간</h2><p>회원 탈퇴 시까지 보유하며, 관계 법령에 따라 결제·전자상거래 기록은 법정 기간 동안 보관합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">4. 처리위탁 및 국외 이전</h2><p>서비스 운영을 위해 다음에 처리를 위탁합니다: <b>Supabase</b>(데이터 저장·인증, 서버 해외 소재), <b>토스페이먼츠</b>(결제 처리). 데이터가 국외 서버에 저장될 수 있습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">5. 이용자의 권리</h2><p>이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">6. 파기</h2><p>보유기간 경과 또는 처리목적 달성 시 지체 없이 파기합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">7. 개인정보 보호책임자</h2><p>박지훈 · 070-8095-3523 · set35230@gmail.com</p></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}