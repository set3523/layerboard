// src/lib/api/auth.ts
import { supabase } from "../supabase";
import { clearClientCacheOnLogout } from "../clientCache";

// 1. 이메일 회원가입
export const signUpWithEmail = async (email: string, password: string) => {
  const cleanEmail = email.trim();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });
  if (error) throw error;
  return data;
};

// 2. 이메일 로그인
export const signInWithEmail = async (email: string, password: string) => {
  const cleanEmail = email.trim();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) throw error;
  return data;
};

/** OAuth/로그인 후 이동 경로 (오픈 리다이렉트 방지) */
export const safeRedirectPath = (raw: string | null | undefined): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
};

// 3. 소셜 로그인 (구글, 카카오)
export const signInWithSocial = async (
  provider: "google" | "kakao",
  redirectPath = "/dashboard"
) => {
  const path = safeRedirectPath(redirectPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${path}`,
    },
  });
  if (error) throw error;
  return data;
};

// 4. 로그아웃 — 세션 + 클라이언트 캐시·localStorage 정리
export const signOut = async () => {
  clearClientCacheOnLogout();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// 5. 현재 로그인한 유저 정보 가져오기 (대시보드 등에서 사용)
// ✨ getSession: 로컬 저장 세션을 읽고 만료 시 refresh 토큰으로 자동 갱신.
//    (getUser는 매번 서버 검증이라 토큰 만료 시 null로 튕겨 로그아웃처럼 보이던 버그)
export const getCurrentUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
};

/** 칠판·presence에 쓸 표시 이름 (소셜 메타 → 이메일 앞부분) */
export const getDisplayName = (user: {
  user_metadata?: Record<string, unknown>;
  email?: string | null;
}): string => {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (meta.full_name as string) ||
    (meta.name as string) ||
    (meta.nickname as string);
  if (fromMeta?.trim()) return fromMeta.trim().slice(0, 10);
  const local = user.email?.split("@")[0];
  return local?.slice(0, 10) || "학생";
};