-- ============================================================
-- layboad — DB 싹 밀기 (public layboad 객체 + Storage 정책)
--
-- ⚠️ room_pages / profiles / rooms 등 데이터 전부 삭제됩니다.
--    auth.users, Storage 버킷 안 파일(객체 행)은 지우지 않습니다.
--
-- 사용: [A] migration-wipe.sql → schema.sql  (점진 반영은 migrate-live.sql)
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;

revoke usage, select on all sequences in schema public from anon;

-- public 테이블 (CASCADE → RLS 정책 함께 제거)
drop table if exists public.room_join_failures cascade;
drop table if exists public.room_members cascade;
drop table if exists public.gift_codes cascade;
drop table if exists public.room_events cascade;
drop table if exists public.room_pages cascade;
drop table if exists public.profiles cascade;
drop table if exists public.rooms cascade;

-- RPC·트리거 함수
drop function if exists public.handle_new_user() cascade;
drop function if exists public.redeem_gift(text) cascade;
drop function if exists public.claim_session(text) cascade;
drop function if exists public.release_session(text) cascade;
drop function if exists public.start_trial() cascade;
drop function if exists public.get_host_usage() cascade;
drop function if exists public.get_room_by_code(text) cascade;
drop function if exists public.is_active_room(uuid) cascade;
drop function if exists public.can_access_room(uuid) cascade;
drop function if exists public.can_read_storage_object(text, text) cascade;
drop function if exists public.join_room(text, text) cascade;
drop function if exists public.create_host_room(text, int) cascade;
drop function if exists public.create_host_room(text) cascade;
drop function if exists public._record_join_failure() cascade;

-- Storage RLS (layboad 정책만)
drop policy if exists "layboad 업로드 본인폴더" on storage.objects;
drop policy if exists "layboad 수정 본인폴더" on storage.objects;
drop policy if exists "layboad 삭제 본인폴더" on storage.objects;
drop policy if exists "layboad 읽기 인증" on storage.objects;

notify pgrst, 'reload schema';
