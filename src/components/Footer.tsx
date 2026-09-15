import Link from "next/link";

// 전자상거래법 / 토스 심사 대응 푸터. 사업자 정보 표기.
// ⚠️ 통신판매업 신고 완료 후, 아래 통신판매업 신고번호 주석을 해제하고 값을 채우세요.
export default function Footer() {
  return (
    <footer className="w-full border-t border-gray-100 gg-glass">
      <div className="max-w-6xl mx-auto px-6 py-10 text-gray-500">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-extrabold text-leaf-600 text-lg">layboad</span>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-500">온라인 수업 칠판</span>
        </div>

        <div className="space-y-0.5 text-xs leading-relaxed text-gray-400">
          <p>상호: 셋삼오이삼(SET3523) · 대표: 박지훈</p>
          <p>사업자등록번호: 840-43-01291</p>
          <p>주소: 서울특별시 성북구 보국문로 16라길 13 204호</p>
          <p>유선번호: 070-8095-3523</p>
          <p>통신판매업 신고번호: 2026-서울성북-0879</p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-xs font-semibold text-gray-500">
          <Link href="/pricing" className="hover:text-leaf-600 transition-colors">요금제</Link>
          <Link href="/terms" className="hover:text-leaf-600 transition-colors">이용약관</Link>
          <Link href="/privacy" className="hover:text-leaf-600 transition-colors">개인정보처리방침</Link>
          <Link href="/refund" className="hover:text-leaf-600 transition-colors">환불정책</Link>
        </div>

        <p className="mt-4 text-xs text-gray-300">© {new Date().getFullYear()} 셋삼오이삼(SET3523). All rights reserved.</p>
      </div>
    </footer>
  );
}
