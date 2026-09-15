// 로그아웃 시 클라이언트 캐시·localStorage 정리 (Supabase signOut 전에 호출)
import { clearBackgroundCaches } from "@/hooks/useBackgroundLoader";
import { clearRoomIdCache } from "@/lib/api/board";

export const SESSION_TOKEN_KEY = "layboad_session_token";

/** Whiteboard.tsx 가 저장하는 room_{코드}_state 키 패턴 */
const isRoomStateKey = (key: string) => key.startsWith("room_") && key.endsWith("_state");

export function clearClientCacheOnLogout() {
  if (typeof window === "undefined") return;

  clearBackgroundCaches();
  clearRoomIdCache();

  localStorage.removeItem(SESSION_TOKEN_KEY);

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isRoomStateKey(key)) toRemove.push(key);
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}
