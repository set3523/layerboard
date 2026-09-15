"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Gift, AlertTriangle, Copy, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

function OneTimeSuccessInner() {
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get("plan") || "basic";
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = params.get("amount");
    if (!paymentKey || !orderId || !amount) { setState("error"); setMsg("결제 정보가 없습니다."); return; }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setState("error"); setMsg("로그인이 필요합니다. 다시 로그인 후 시도해 주세요."); return; }
      try {
        const r = await fetch("/billing/onetime", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paymentKey, orderId, amount: Number(amount), plan }),
        });
        const d = await r.json();
        if (r.ok && d.code) { setCode(d.code); setState("done"); }
        else { setState("error"); setMsg(typeof d.error === "string" ? d.error : "처리 실패"); }
      } catch { setState("error"); setMsg("네트워크 오류"); }
    })();
  }, [params, plan]);

  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 font-sans text-gray-900 selection:bg-leaf-100">
      <div className="gg-glass p-10 text-center max-w-md w-full">
        {state === "loading" && <><Loader2 className="animate-spin text-leaf-600 mx-auto mb-4" size={40} /><p className="font-bold text-gray-700">결제 처리 중...</p></>}
        {state === "done" && (
          <>
            <Gift className="text-emerald-500 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-extrabold mb-2">{plan === "pro" ? "Pro" : "Basic"} 1개월권 발급 완료!</h2>
            <p className="text-gray-500 mb-5 text-sm">아래 코드를 <b>본인 계정</b>에 등록하거나, 선물할 상대에게 전달하세요.</p>
            <button onClick={copy} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl mb-6 hover:border-leaf-400 transition-colors">
              <span className="text-2xl font-extrabold tracking-widest text-gray-800">{code}</span>
              <span className={`p-2 rounded-lg ${copied ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>{copied ? <Check size={18} /> : <Copy size={18} />}</span>
            </button>
            <button onClick={() => router.push("/dashboard")} className="gg-btn gg-btn--primary gg-btn--block gg-drop">대시보드에서 등록하기</button>
          </>
        )}
        {state === "error" && <><AlertTriangle className="text-red-500 mx-auto mb-4" size={48} /><h2 className="text-2xl font-extrabold mb-2">결제 실패</h2><p className="text-gray-500 mb-8">{msg}</p><button onClick={() => router.push("/pricing")} className="gg-btn gg-btn--ghost gg-btn--block">다시 시도</button></>}
      </div>
    </div>
  );
}

export default function OneTimeSuccess() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center selection:bg-leaf-100"><Loader2 className="animate-spin text-leaf-600" size={40} /></div>}>
      <OneTimeSuccessInner />
    </Suspense>
  );
}
