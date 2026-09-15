// src/lib/api/rooms.ts
import { supabase } from "../supabase";
import { getTeacherPlan, getPlanStudentCap } from "./usage";

/**
 * 1. 새로운 교실(방) 생성하기
 * ✨ 변경점: 파라미터로 안 받고, 여기서 직접 로그인 유저를 확인합니다.
 */
export const createRoom = async (teacherId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("로그인 세션이 만료되었습니다.");

  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // 방 정원 = 선생님 요금제 기준 (생성 시점에 고정 저장)
  const maxStudents = getPlanStudentCap(await getTeacherPlan());

  const { data, error } = await supabase
    .from("rooms")
    .insert([
      {
        code: roomCode,
        teacher_id: user.id, // ✨ 텍스트가 아닌, 진짜 로그인된 디지털 ID 사용
        is_active: true,
        max_students: maxStudents,
      }
    ])
    .select()
    .single();

  if (error) {
    // 에러 객체를 문자열로 풀어서 진짜 원인을 보여주도록 수정
    console.error("🚨 방 생성 오류:", JSON.stringify(error, null, 2));
    throw error;
  }

  // ✨ 첫 방 생성 시 30일 무료체험 시작 (이미 시작됐으면 start_trial RPC가 no-op)
  supabase.rpc("start_trial").then(({ error: e }) => {
    if (e) console.warn("무료체험 시작 RPC 실패(무시):", e.message);
  });
  
  return data;
};

/**
 * 2. 선생님의 방 목록 불러오기 (대시보드용)
 * ✨ 변경점: 여기도 파라미터 대신 직접 로그인 유저를 확인합니다.
 */
export const getTeacherRooms = async (teacherId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("로그인 세션이 만료되었습니다.");

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("teacher_id", user.id) // ✨ 진짜 ID로만 검색
    .order("created_at", { ascending: false });

  if (error) {
    console.error("🚨 방 목록 로딩 오류:", JSON.stringify(error, null, 2));
    throw error;
  }
  
  return data;
};

/**
 * 3. 방 코드 유효성 검사 (입장 전) — 로그인 세션 필수
 */
export const verifyRoomCode = async (code: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.rpc("get_room_by_code", { p_code: code });
  if (error) {
    console.error("방 코드 검증 중 오류 발생:", error);
    return null;
  }
  return (data && data[0]) || null;
};

export const deleteRoom = async (roomId: string) => {
  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId);

  if (error) {
    console.error("교실 삭제 에러:", error);
    throw error;
  }
};