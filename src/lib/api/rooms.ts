// src/lib/api/rooms.ts
import { supabase } from "../supabase";
import { appErrorFromSupabase, AppError, logApiError } from "./errorMessage";

export type JoinRoomResult =
  | "ok"
  | "invalid_code"
  | "wrong_passphrase"
  | "rate_limited"
  | "full"
  | "not_authenticated";

export const createRoom = async (_hostId: string, passphrase: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    throw new AppError("로그인 세션이 만료되었습니다.", { code: "AUTH_NO_SESSION", context: "createRoom" });
  }

  const trimmed = passphrase.trim();
  if (trimmed.length < 4) {
    throw new AppError("암호는 4자 이상 입력해 주세요.", { code: "VALIDATION_PASSPHRASE", context: "createRoom" });
  }

  const { data, error } = await supabase.rpc("create_host_room", {
    p_passphrase: trimmed,
  });

  if (error) {
    logApiError("create_host_room", error);
    throw appErrorFromSupabase(error, "create_host_room");
  }

  let room: Record<string, unknown> | null = data as Record<string, unknown> | null;
  if (typeof data === "string") {
    try {
      room = JSON.parse(data) as Record<string, unknown>;
    } catch {
      room = null;
    }
  }
  if (!room?.code) {
    throw new AppError("RPC 응답에 code가 없습니다. schema.sql 적용·API 캐시 reload 확인.", {
      code: "RPC_BAD_RESPONSE",
      context: "create_host_room",
      details: typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data)?.slice(0, 200),
    });
  }

  supabase.rpc("start_trial").then(({ error: e }) => {
    if (e) logApiError("start_trial", e);
  });

  return room as {
    id: string;
    code: string;
    host_id: string;
    is_active: boolean;
    max_students: number;
    created_at: string;
  };
};

export const getHostRooms = async (_hostId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    throw new AppError("로그인 세션이 만료되었습니다.", { code: "AUTH_NO_SESSION", context: "getHostRooms" });
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("host_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logApiError("rooms.select", error);
    throw appErrorFromSupabase(error, "rooms.select");
  }

  return data;
};

/** @deprecated use getHostRooms */
export const getTeacherRooms = getHostRooms;

export const joinRoom = async (code: string, passphrase: string): Promise<JoinRoomResult> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "not_authenticated";

  const { data, error } = await supabase.rpc("join_room", {
    p_code: code.trim().toUpperCase(),
    p_passphrase: passphrase,
  });

  if (error) {
    logApiError("join_room", error);
    throw appErrorFromSupabase(error, "join_room");
  }
  return (data as JoinRoomResult) || "invalid_code";
};

export type SetHostPassphraseResult = "ok" | "too_short" | "not_found" | "not_authenticated";

/** 방장만 — 입장 암호 해시 재등록 (평문은 서버에 저장하지 않음) */
export const setHostRoomPassphrase = async (
  code: string,
  passphrase: string
): Promise<SetHostPassphraseResult> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "not_authenticated";

  const { data, error } = await supabase.rpc("set_host_room_passphrase", {
    p_code: code.trim().toUpperCase(),
    p_passphrase: passphrase,
  });

  if (error) {
    logApiError("set_host_room_passphrase", error);
    throw appErrorFromSupabase(error, "set_host_room_passphrase");
  }
  return (data as SetHostPassphraseResult) || "not_found";
};

export const verifyRoomCode = async (code: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.rpc("get_room_by_code", { p_code: code });
  if (error) {
    logApiError("get_room_by_code", error);
    return null;
  }
  return (data && data[0]) || null;
};

export const deleteRoom = async (roomId: string) => {
  const { error } = await supabase.from("rooms").delete().eq("id", roomId);

  if (error) {
    logApiError("rooms.delete", error);
    throw appErrorFromSupabase(error, "rooms.delete");
  }
};
