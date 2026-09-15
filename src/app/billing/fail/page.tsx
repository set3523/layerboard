"use client";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

function BillingFailInner() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <div className="flex h-screen w-full items-center justify-center px-4 font-sans text-gray-900 selection:bg-leaf-100">
      <div className="gg-glass p-10 text-center max-w-md w-full">
        <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
        <h2 className="text-2xl font-extrabold mb-2">결제가 취소됐어요</h2>
        <p className="text-gray-500 mb-8">{params.get("message") || "카드 등록이 완료되지 않았습니다."}</p>
        <button onClick={() => router.push("/pricing")} className="gg-btn gg-btn--ghost gg-btn--block">요금제로</button>
      </div>
    </div>
  );
}

export default function BillingFail() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-gray-50" />}>
      <BillingFailInner />
    </Suspense>
  );
}
