"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function BillingSuccessInner() {
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get("plan") || "pro";
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const authKey = params.get("authKey");
    if (!authKey) { setState("error"); setMsg("결제 정보가 없습니다."); return; }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setState("error"); setMsg("로그인이 필요합니다. 다시 로그인 후 시도해 주세요."); return; }
      try {
        const r = await fetch("/billing/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ authKey, plan }),
        });
        const d = await r.json();
        if (r.ok) setState("done");
        else { setState("error"); setMsg(typeof d.error === "string" ? d.error : "처리 실패"); }
      } catch {
        setState("error"); setMsg("네트워크 오류");
      }
    })();
  }, [params, plan]);
  return (
    <div className="flex h-screen w-full items-center justify-center px-4 font-sans text-gray-900 selection:bg-leaf-100">
      <div className="gg-glass p-10 text-center max-w-md w-full">
        {state === "loading" && <><Loader2 className="animate-spin text-leaf-600 mx-auto mb-4" size={40} /><p className="font-bold text-gray-700">결제 처리 중...</p></>}
        {state === "done" && <><CheckCircle2 className="text-emerald-500 mx-auto mb-4" size={48} /><h2 className="text-2xl font-extrabold mb-2">{plan === "pro" ? "Pro" : "Basic"} 구독 완료!</h2><p className="text-gray-500 mb-8">{plan === "pro" ? "그룹 10명·20GB로 업그레이드됐어요." : "이제 결제 걱정 없이 계속 사용할 수 있어요."}</p><button onClick={() => router.push("/dashboard")} className="gg-btn gg-btn--primary gg-btn--block gg-drop">대시보드로</button></>}
        {state === "error" && <><AlertTriangle className="text-red-500 mx-auto mb-4" size={48} /><h2 className="text-2xl font-extrabold mb-2">결제 실패</h2><p className="text-gray-500 mb-8">{msg}</p><button onClick={() => router.push("/pricing")} className="gg-btn gg-btn--ghost gg-btn--block">다시 시도</button></>}
      </div>
    </div>
  );
}

export default function BillingSuccess() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center selection:bg-leaf-100"><Loader2 className="animate-spin text-leaf-600" size={40} /></div>}>
      <BillingSuccessInner />
    </Suspense>
  );
}
