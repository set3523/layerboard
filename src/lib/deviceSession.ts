import { supabase } from "./supabase";
import { SESSION_TOKEN_KEY } from "./clientCache";

export const IDLE_LOGOUT_MS = 10 * 60 * 1000;

export const makeDeviceToken = (): string => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getDeviceToken = (): string => {
  if (typeof window === "undefined") return makeDeviceToken();
  let token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    token = makeDeviceToken();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  return token;
};

export const fetchRemoteActiveSession = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("active_session")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("active_session 조회 실패:", error);
    return null;
  }
  const v = data?.active_session;
  return typeof v === "string" && v.length > 0 ? v : null;
};

export type DeviceSessionStatus = "none" | "own" | "other";

export const getDeviceSessionStatus = async (): Promise<{
  userId: string | null;
  status: DeviceSessionStatus;
  myToken: string;
}> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return { userId: null, status: "none", myToken: "" };

  const myToken = getDeviceToken();
  const remote = await fetchRemoteActiveSession(userId);
  if (!remote) return { userId, status: "none", myToken };
  if (remote === myToken) return { userId, status: "own", myToken };
  return { userId, status: "other", myToken };
};

export const claimDeviceSession = async (token?: string) => {
  const t = token ?? getDeviceToken();
  const { error } = await supabase.rpc("claim_session", { p_token: t });
  if (error) throw error;
};

export const releaseDeviceSession = async () => {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) return;
  await supabase.rpc("release_session", { p_token: token });
};

export const OTHER_DEVICE_CONFIRM_MESSAGE =
  "다른 기기에서 로그인 중입니다.\n\n이 기기에서 계속하면 다른 기기는 자동으로 로그아웃됩니다. 진행할까요?";

/** 로그인 직후 등 — 충돌 시 confirm, 취소하면 signOut 호출은 호출측에서 */
export const confirmTakeoverOtherDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.confirm(OTHER_DEVICE_CONFIRM_MESSAGE);
};
