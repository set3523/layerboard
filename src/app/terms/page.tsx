import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import Footer from "@/components/Footer";

export const metadata = { title: "이용약관 — layboad" };

export default function Terms() {
  return (
    <div className="min-h-screen text-gray-800 font-sans selection:bg-leaf-100">
      <header className="gg-glass border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-leaf-600"><MonitorPlay size={22} /> layboad</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-14 leading-relaxed text-[15px]">
        <h1 className="text-3xl font-extrabold mb-2">이용약관</h1>
        <p className="text-sm text-gray-400 mb-10">시행일: 2026년 7월 1일</p>
        <section className="space-y-6">
          <div><h2 className="text-lg font-bold mb-2">제1조 (목적)</h2><p>본 약관은 셋삼오이삼(SET3523)(이하 "회사")가 제공하는 온라인 수업 칠판 서비스 "layboad"(이하 "서비스")의 이용과 관련하여 회사와 이용자 간 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제2조 (정의)</h2><p>"이용자"란 본 약관에 동의하고 서비스를 이용하는 회원(방장) 및 회원이 개설한 교실에 참여하는 참가자를 말합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제3조 (이용계약의 성립)</h2><p>이용계약은 이용자가 약관에 동의하고 회원가입을 완료함으로써 성립합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제4조 (서비스 제공)</h2><p>회사는 실시간 필기·화면 공유, 교재(PDF·이미지) 업로드, 단계별 풀이 등 온라인 수업 도구를 제공하며, 서비스 개선을 위해 기능을 변경할 수 있습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제5조 (요금 및 결제)</h2><p>서비스는 무료 체험 및 유료 구독(월 정기결제)으로 제공됩니다. 요금·플랜은 요금제 페이지에 따르며, 유료 구독은 매월 자동 결제됩니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제6조 (해지 및 환불)</h2><p>이용자는 언제든지 구독을 해지할 수 있으며, 환불은 회사의 환불 정책에 따릅니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제7조 (이용자 의무·콘텐츠 책임)</h2><p>이용자는 본인이 적법한 권리를 보유한 자료만 업로드해야 하며, 업로드한 교재·자료의 저작권 등 법적 책임은 이용자 본인에게 있습니다. 타인의 권리를 침해하는 업로드로 발생하는 문제에 대해 회사는 책임지지 않습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제8조 (면책)</h2><p>회사는 천재지변, 이용자의 귀책, 제3자 서비스 장애 등 통제를 벗어난 사유로 인한 손해에 대해 책임을 지지 않습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">제9조 (준거법)</h2><p>본 약관은 대한민국 법률에 따릅니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">문의</h2><p>셋삼오이삼(SET3523) · 대표: 박지훈 · 070-8095-3523 · set35230@gmail.com</p></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}