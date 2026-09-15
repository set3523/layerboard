import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { clearClientCacheOnLogout, SESSION_TOKEN_KEY } from "../lib/clientCache";

// 🔒 단일 활성 세션:
//  - 이 기기의 고유 토큰으로 profiles.active_session 을 점유(claim)한다.
//  - 자기 프로필 행을 실시간 구독 → active_session 이 '내 토큰'과 달라지면(= 다른 기기에서 로그인)
//    즉시 로그아웃시켜 두 기기 동시 편집을 원천 차단한다.
//  - 로그인 안 한 사용자(학생 등)는 대상 아님(no-op).

const makeToken = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const useSingleSession = () => {
  useEffect(() => {
    let channel: any = null;
    let active = true;
    let myToken = "";

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return; // 비로그인은 대상 아님

      // 이 기기 토큰(같은 기기 새로고침·재입장엔 동일 유지 → 자기 자신은 안 튕김)
      myToken = localStorage.getItem(SESSION_TOKEN_KEY) || makeToken();
      localStorage.setItem(SESSION_TOKEN_KEY, myToken);

      // 내 토큰으로 활성 세션 점유 (이전 기기 토큰을 덮어씀)
      await supabase.rpc("claim_session", { p_token: myToken });

      // 내 프로필 행 구독 → active_session 이 내 토큰과 달라지면 다른 기기 로그인으로 보고 강제 로그아웃
      channel = supabase
        .channel(`session:${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload: any) => {
            const cur = payload?.new?.active_session;
            if (active && cur && cur !== myToken) {
              active = false;
              clearClientCacheOnLogout();
              supabase.auth.signOut().finally(() => {
                alert("다른 기기에서 로그인되어 이 기기는 로그아웃됩니다.");
                window.location.href = "/login";
              });
            }
          }
        )
        .subscribe();
    };

    setup();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
};
