"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/api/auth";
import { clearClientCacheOnLogout } from "@/lib/clientCache";
import {
  claimDeviceSession,
  getDeviceSessionStatus,
  getDeviceToken,
  OTHER_DEVICE_CONFIRM_MESSAGE,
} from "@/lib/deviceSession";
import { useIdleLogout } from "@/hooks/useIdleLogout";

type Phase = "loading" | "conflict" | "ready" | "denied";

type Props = {
  children: React.ReactNode;
  enableIdleLogout?: boolean;
};

function isRoomRoute(pathname: string | null): boolean {
  return !!pathname && (pathname.startsWith("/room/") || pathname === "/room");
}

export default function SessionGuard({ children, enableIdleLogout = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("loading");
  const conflictUserIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myTokenRef = useRef("");
  const kickActiveRef = useRef(true);

  const idleLogoutActive =
    enableIdleLogout && !isRoomRoute(pathname) && phase === "ready";
  useIdleLogout(idleLogoutActive);

  const subscribeKick = useCallback((userId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    myTokenRef.current = getDeviceToken();
    kickActiveRef.current = true;
    channelRef.current = supabase
      .channel(`session:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload: { new?: { active_session?: string | null } }) => {
          const cur = payload?.new?.active_session;
          if (kickActiveRef.current && cur && cur !== myTokenRef.current) {
            kickActiveRef.current = false;
            clearClientCacheOnLogout();
            supabase.auth.signOut().finally(() => {
              alert("다른 기기에서 로그인되어 이 기기는 로그아웃됩니다.");
              window.location.href = "/login";
            });
          }
        }
      )
      .subscribe();
  }, []);

  const enterReady = useCallback(
    async (userId: string) => {
      await claimDeviceSession();
      subscribeKick(userId);
      setPhase("ready");
    },
    [subscribeKick]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { userId, status } = await getDeviceSessionStatus();
      if (cancelled) return;
      if (!userId) {
        setPhase("denied");
        router.replace("/login");
        return;
      }
      if (status === "other") {
        conflictUserIdRef.current = userId;
        setPhase("conflict");
        return;
      }
      await enterReady(userId);
    })();

    return () => {
      cancelled = true;
      kickActiveRef.current = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [enterReady, router]);

  const onConfirmTakeover = async () => {
    const userId = conflictUserIdRef.current;
    if (!userId) {
      router.replace("/login");
      return;
    }
    try {
      await enterReady(userId);
    } catch (e) {
      console.error(e);
      alert("세션 연결에 실패했습니다. 다시 로그인해 주세요.");
      await signOut();
      router.replace("/login");
    }
  };

  const onCancelTakeover = async () => {
    await signOut();
    setPhase("denied");
    router.replace("/login?reason=other_device");
  };

  if (phase === "loading") {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-leaf-600" size={36} />
      </div>
    );
  }

  if (phase === "conflict") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
        <div className="gg-glass max-w-md w-full p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">다른 기기에서 사용 중</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line">{OTHER_DEVICE_CONFIRM_MESSAGE}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancelTakeover} className="gg-btn gg-btn--ghost px-4">
              취소
            </button>
            <button type="button" onClick={onConfirmTakeover} className="gg-btn gg-btn--primary px-4">
              이 기기에서 계속
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "denied") return null;

  return <>{children}</>;
}
