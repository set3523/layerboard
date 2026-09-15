import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import Footer from "@/components/Footer";

export const metadata = { title: "환불 정책 — layboad" };

export default function RefundPolicy() {
  return (
    <div className="min-h-screen text-gray-800 font-sans selection:bg-leaf-100">
      <header className="gg-glass border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-leaf-600"><MonitorPlay size={22} /> layboad</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-14 leading-relaxed text-[15px]">
        <h1 className="text-3xl font-extrabold mb-2">환불 정책</h1>
        <p className="text-sm text-gray-400 mb-10">시행일: 2026년 7월 1일</p>
        <section className="space-y-6">
          <div><h2 className="text-lg font-bold mb-2">1. 무료 체험</h2><p>모든 이용자에게 첫 교실 개설일로부터 30일 무료 체험을 제공하며, 체험 기간 중에는 어떠한 요금도 청구되지 않습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">2. 청약철회 (결제 후 7일)</h2><p>유료 구독 결제 후 <b>7일 이내</b>이고 서비스를 <b>실질적으로 이용하지 않은 경우</b> 전액 환불받으실 수 있습니다. 다만 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조에 따라 서비스(디지털 용역) 제공이 개시된 이후에는 청약철회가 제한될 수 있습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">3. 구독 해지</h2><p>구독은 언제든지 대시보드에서 해지할 수 있습니다. 해지 시 다음 결제(자동갱신)가 중단되며, <b>이미 결제한 이용 기간의 종료일까지 계속 이용</b>할 수 있습니다. 이미 이용한 기간에 대한 부분(일할) 환불은 제공되지 않습니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">4. 결제 오류·중복 결제</h2><p>시스템 오류로 인한 중복 결제·오결제가 확인된 경우 해당 금액을 전액 환불합니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">5. 환불 방법 및 기간</h2><p>환불은 원 결제수단 취소를 원칙으로 하며, 승인 후 결제사 사정에 따라 영업일 기준 3~7일 이내 처리됩니다.</p></div>
          <div><h2 className="text-lg font-bold mb-2">6. 문의</h2><p>070-8095-3523 · set35230@gmail.com<br/>상호: 셋삼오이삼(SET3523) · 대표: 박지훈 · 사업자등록번호: 840-43-01291</p></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}