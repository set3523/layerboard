-- ============================================================
-- layboad: 로그인 필수 입장 — anon(비로그인) 교실 API 권한 회수
--
-- 언제: 프론트에서 학생/선생 모두 로그인 후 입장하도록 바꾼 뒤
-- 어디: Supabase Dashboard → SQL Editor → 이 파일 통째로 실행 (1회)
--
-- schema.sql 신규 설치에는 이미 반영됨. 기존 프로젝트만 이 스크립트 실행.
-- ============================================================

-- 1) RPC·테이블: anon 직접 접근 제거
revoke execute on function public.get_room_by_code(text) from anon;
revoke select on public.room_pages from anon;
revoke select, insert on public.room_events from anon;

-- 2) room_events INSERT: authenticated만 (활성 방 한정은 기존과 동일)
drop policy if exists "활성 방 이벤트 추가" on public.room_events;
create policy "활성 방 이벤트 추가" on public.room_events
  for insert to authenticated
  with check ( public.is_active_room(room_id) );

-- 3) (선택) bigserial 시퀀스 — anon에 남아 있으면 회수
revoke usage, select on all sequences in schema public from anon;
