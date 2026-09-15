// src/lib/api/board.ts
import { supabase } from "../supabase";
import { RoomEvent } from "../../types/board";

// 🧠 6자리 방 코드를 긴 UUID로 변환해두는 임시 기억장치 (DB 과부하 방지용)
const roomIdCache: Record<string, string> = {};

/** 로그아웃 시 방 코드→UUID 메모리 캐시 비우기 */
export function clearRoomIdCache() {
  for (const key of Object.keys(roomIdCache)) delete roomIdCache[key];
}

// 👉 방 코드("IE96QA")를 넣으면 진짜 UUID("123e-...")로 바꿔주는 통역 함수
const getInternalRoomId = async (roomCode: string) => {
  // 이미 기억하고 있는 UUID면 DB 조회 없이 바로 반환 (자동저장 시 초고속 처리)
  if (roomIdCache[roomCode]) return roomIdCache[roomCode];

  // ✨ rooms 직접 조회 대신 RPC (코드→UUID). 전체 방 열거 차단.
  const { data, error } = await supabase.rpc("get_room_by_code", { p_code: roomCode });
  const room = data && data[0];
  if (error || !room) {
    console.error("방 UUID 조회 에러:", error);
    throw error || new Error("방을 찾을 수 없습니다.");
  }

  // 찾은 UUID를 다음을 위해 메모리에 저장
  roomIdCache[roomCode] = room.id;
  return room.id;
};

// ---------------------------------------------------------

// 1. 방의 전체 페이지 데이터 불러오기 (지각생 입장 시 사용)
export const getRoomPages = async (roomCode: string) => {
  // 🌟 짧은 코드("IE96QA")를 긴 UUID로 변환
  const internalId = await getInternalRoomId(roomCode);

  const { data, error } = await supabase
    .from("room_pages")
    .select("page_index, background, steps, canvas_json")
    .eq("room_id", internalId) // 🌟 변환된 UUID로 검색!
    .order("page_index", { ascending: true });

  if (error) {
    console.error("페이지 로딩 에러:", error);
    throw error;
  }
  
  return data;
};

// 2. 선생님이 필기한 페이지 데이터 저장하기 (수시로 백업)
export const saveRoomPages = async (roomCode: string, pages: any[]) => {
  // 🌟 짧은 코드("IE96QA")를 긴 UUID로 변환
  const internalId = await getInternalRoomId(roomCode);

  // DB에 넣기 좋게 데이터를 배열 형태로 가공
  const upsertData = pages.map((page, index) => ({
    room_id: internalId, // 🌟 변환된 UUID로 저장!
    page_index: index,
    background: page.background || {},
    steps: page.steps || [],
    canvas_json: page.json || {},
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("room_pages")
    .upsert(upsertData, {
      onConflict: "room_id, page_index", // 같은 방, 같은 페이지 번호면 덮어쓰기!
    });

  if (error) {
    console.error("페이지 백업 에러:", error);
    throw error;
  }

  // 🧹 페이지 수가 줄었으면(삭제됨) 남은 잔여 행 정리 — 안 하면 삭제한 페이지가 부활함
  const { error: delErr } = await supabase
    .from("room_pages")
    .delete()
    .eq("room_id", internalId)
    .gte("page_index", pages.length);

  if (delErr) console.error("잔여 페이지 정리 에러:", delErr);
};

// ---------------------------------------------------------
// 이벤트 로그 (재생/역사 원천)
// ---------------------------------------------------------

// 3. 이벤트 한 줄 이상 추가 (그리기/지우기/페이지 이동 등)
export const appendEvents = async (
  roomCode: string,
  events: Omit<RoomEvent, "id" | "created_at">[]
) => {
  if (!events || events.length === 0) return;
  try {
    const internalId = await getInternalRoomId(roomCode);
    const rows = events.map((e) => ({ room_id: internalId, ...e }));
    const { error } = await supabase.from("room_events").insert(rows);
    if (error) console.error("이벤트 기록 에러:", error);
  } catch (err) {
    console.error("이벤트 기록 실패:", err);
  }
};

// 4. 방의 모든 이벤트를 순서대로 불러오기 (재생용)
export const getRoomEvents = async (roomCode: string): Promise<RoomEvent[]> => {
  const internalId = await getInternalRoomId(roomCode);
  const { data, error } = await supabase
    .from("room_events")
    .select("*")
    .eq("room_id", internalId)
    .order("id", { ascending: true });

  if (error) {
    console.error("이벤트 로드 에러:", error);
    throw error;
  }
  return (data as RoomEvent[]) || [];
};

// 5. (선택) 종료된 수업의 이벤트 로그를 gzip 파일로 Storage에 아카이브
//    ⚠️ 지금은 방을 재사용하는 구조라 자동 prune(삭제)은 하지 않습니다.
//    재생 기능을 붙일 때 보존정책(예: N일 미사용 방)을 정한 뒤 호출하세요.
export const archiveRoomEvents = async (roomCode: string) => {
  const internalId = await getInternalRoomId(roomCode);
  const events = await getRoomEvents(roomCode);
  if (events.length === 0) return;

  const json = JSON.stringify(events);
  // 브라우저 CompressionStream 으로 gzip 압축
  const gzBlob = await new Response(
    new Response(json).body!.pipeThrough(new CompressionStream("gzip"))
  ).blob();

  const { error } = await supabase.storage
    .from("replays")
    .upload(`${internalId}.json.gz`, gzBlob, {
      contentType: "application/gzip",
      upsert: true,
    });

  if (error) console.error("재생 아카이브 업로드 실패:", error);
};