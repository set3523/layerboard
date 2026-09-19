import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/api/auth";
import { IDLE_LOGOUT_MS } from "@/lib/deviceSession";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

/** SessionGuard: /room/* 제외, 그 외 enableIdleLogout 페이지에서만. 10분간 입력 없으면 로그아웃 */
export function useIdleLogout(enabled: boolean) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = () => {
      clearTimer();
      timerRef.current = setTimeout(async () => {
        if (!enabledRef.current) return;
        try {
          await signOut();
        } catch (e) {
          console.error("idle signOut", e);
        }
        alert("10분간 활동이 없어 로그아웃되었습니다.");
        router.replace("/login");
      }, IDLE_LOGOUT_MS);
    };

    const onActivity = () => {
      if (!enabledRef.current) return;
      schedule();
    };

    schedule();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onActivity();
    });

    return () => {
      clearTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [enabled, router]);
}
