-- ============================================================
-- layboad — 전체 스키마 (단일 재현용 마이그레이션)
--   맨 위에서 전부 삭제 → 아래에서 재생성. 각 블록에 "왜 / 어느 코드가 쓰는지" 주석.
--   ⚠️ auth.users, storage.objects 는 Supabase 기본 객체 → 만들지 않고 참조/정책만.
--   실행: Supabase SQL Editor에 통째로 붙여넣기.
-- ============================================================


-- ===== 0. 전체 삭제 (깨끗한 상태) ==========================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.redeem_gift(text) cascade;
drop function if exists public.claim_session(text) cascade;
drop function if exists public.start_trial() cascade;
drop function if exists public.get_teacher_usage() cascade;
drop function if exists public.get_room_by_code(text) cascade;
drop function if exists public.is_active_room(uuid) cascade;

drop table if exists public.gift_codes cascade;
drop table if exists public.room_events cascade;
drop table if exists public.room_pages cascade;
drop table if exists public.profiles cascade;
drop table if exists public.rooms cascade;
-- (storage 버킷은 삭제 안 함 = 파일 보존. 정책만 아래서 DROP IF EXISTS 후 재생성)


-- ===== 1. rooms (교실) ====================================================
--   코드: rooms.ts(createRoom/getTeacherRooms/deleteRoom), board.ts(코드→UUID),
--         room_pages/room_events FK 대상.
create table public.rooms (
  id           uuid primary key default gen_random_uuid(),  -- delete/ FK 기준
  code         text unique not null,                        -- 6자리 초대코드 (createRoom 생성, get_room_by_code 조회)
  teacher_id   uuid not null references auth.users(id) on delete cascade, -- 방 주인(선생)
  is_active    boolean not null default true,               -- 활성 방만 학생 입장/조회 가능
  max_students integer not null default 3,                  -- 생성 시점 요금제 정원 고정 (usage.getPlanStudentCap)
  created_at   timestamptz not null default now()           -- getTeacherRooms 정렬용
);
alter table public.rooms enable row level security;

-- 선생님은 '자기 방'만 조회/생성/삭제
create policy "rooms 선생 조회" on public.rooms for select using (auth.uid() = teacher_id); -- getTeacherRooms, insert().select()
create policy "rooms 선생 생성" on public.rooms for insert with check (auth.uid() = teacher_id); -- createRoom
create policy "rooms 선생 삭제" on public.rooms for delete using (auth.uid() = teacher_id); -- deleteRoom

-- 비로그인(anon)은 rooms 직접 조회 차단 → get_room_by_code RPC는 authenticated만
revoke select on public.rooms from anon;
grant select, insert, delete on public.rooms to authenticated;


-- ===== 2. 헬퍼 함수 (RLS·입장에서 사용) ===================================
-- is_active_room: room_pages/room_events 정책이 사용. SECURITY DEFINER라
--   rooms를 직접 못 봐도 '이 방 활성인가?'만 확인 가능.
create or replace function public.is_active_room(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.rooms where id = rid and is_active = true);
$$;
grant execute on function public.is_active_room(uuid) to anon, authenticated;

-- get_room_by_code: verifyRoomCode(rooms.ts) / getInternalRoomId(board.ts) 가 사용.
--   코드로 방 '1개'만 반환 → 목록 긁기 차단.
create or replace function public.get_room_by_code(p_code text)
returns table (id uuid, code text, is_active boolean, teacher_id uuid, max_students integer)
language sql security definer set search_path = public as $$
  select id, code, is_active, teacher_id, max_students
  from public.rooms where code = p_code and is_active = true limit 1;
$$;
grant execute on function public.get_room_by_code(text) to authenticated;


-- ===== 3. room_pages (페이지/필기 스냅샷) =================================
--   코드: board.ts(getRoomPages/saveRoomPages). 지각생 입장 시 여기서 로드.
create table public.room_pages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  page_index  integer not null,
  background  jsonb default '{}'::jsonb,   -- 배경(PDF url·pdfPageNumber 등) + 배경필기(drawingsJson)
  steps       jsonb default '[]'::jsonb,   -- 풀이 단계
  canvas_json jsonb default '{}'::jsonb,   -- 전경 필기 (배경 이미지는 넣지 않음 = 용량 방지)
  updated_at  timestamptz not null default timezone('utc', now()),
  unique(room_id, page_index)
);
alter table public.room_pages enable row level security;

-- 학생 포함 누구나 활성 방의 페이지 조회 (지각생 로드)
create policy "활성 방 페이지 조회" on public.room_pages for select using ( public.is_active_room(room_id) );
-- 선생님만 자기 방 페이지 수정 (자동저장)
create policy "선생 방 페이지 관리" on public.room_pages for all
  using ( exists (select 1 from public.rooms r where r.id = room_pages.room_id and r.teacher_id = auth.uid()) );

grant select, insert, update, delete on public.room_pages to authenticated;


-- ===== 4. room_events (이벤트 로그 / 재생 원천) ===========================
--   코드: board.ts(appendEvents/getRoomEvents). 학생도 insert 가능(활성 방 한정).
create table public.room_events (
  id          bigserial primary key,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  page_index  integer not null default 0,
  type        text not null,               -- 'add' | 'erase' | 'page' ...
  payload     jsonb not null,
  author_name text,
  author_role text,
  created_at  timestamptz not null default timezone('utc', now())
);
create index room_events_room_id_id_idx on public.room_events (room_id, id);
alter table public.room_events enable row level security;

create policy "활성 방 이벤트 조회" on public.room_events for select using ( public.is_active_room(room_id) );
create policy "활성 방 이벤트 추가" on public.room_events for insert to authenticated
  with check ( public.is_active_room(room_id) );
create policy "선생 방 이벤트 관리" on public.room_events for all
  using ( exists (select 1 from public.rooms r where r.id = room_events.room_id and r.teacher_id = auth.uid()) );

grant select, insert, update, delete on public.room_events to authenticated;
grant usage, select on all sequences in schema public to authenticated; -- bigserial 시퀀스


-- ===== 5. profiles (선생 계정: 요금제·결제·체험·세션) =====================
--   코드: usage.ts(getAccountStatus/getTeacherPlan), billing/*(routes), useSingleSession.
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  plan               text not null default 'basic',   -- 'basic' | 'pro'
  email              text,
  created_at         timestamptz not null default now(),
  -- 결제/구독 (billing/issue·renew·cancel, usage.getAccountStatus)
  billing_key        text,        -- 자동결제 빌링키(있으면 정기결제 대상)
  customer_key       text,
  current_period_end date,        -- 유료 이용 종료일
  status             text not null default 'none',  -- none | trialing | active | canceled | past_due
  pending_plan       text,
  trial_ends_at      timestamptz, -- 30일 무료체험 종료 (start_trial)
  last_payment_key   text,        -- 환불용
  past_due_since     date,        -- 결제 실패 유예 시작
  -- 단일 활성 세션 (useSingleSession/claim_session)
  active_session     text
);
alter table public.profiles enable row level security;

create policy "본인 프로필 조회" on public.profiles for select using (auth.uid() = id);
grant select on public.profiles to authenticated;

-- 가입 시 profiles 자동 생성 (트리거)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'basic') on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 기존 유저 백필
insert into public.profiles (id, email, plan)
select id, email, 'basic' from auth.users on conflict (id) do nothing;

-- profiles 실시간 구독 (다른 기기 로그인 시 강제 로그아웃 = useSingleSession)
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when others then null; end $$;


-- ===== 6. 계정 함수: start_trial / claim_session / get_teacher_usage ======
-- 첫 방 생성 시 30일 체험 시작 (rooms.ts createRoom → rpc('start_trial'))
create or replace function public.start_trial()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  select trial_ends_at into ends from public.profiles where id = auth.uid();
  if ends is null then
    ends := now() + interval '30 days';
    update public.profiles set trial_ends_at = ends,
      status = case when status = 'active' then status else 'trialing' end
      where id = auth.uid();
  end if;
  return ends;
end; $$;
grant execute on function public.start_trial() to authenticated;

-- 단일 활성 세션 점유 (useSingleSession → rpc('claim_session'))
create or replace function public.claim_session(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set active_session = p_token where id = auth.uid();
$$;
grant execute on function public.claim_session(text) to authenticated;

-- 저장 용량 합산 (usage.ts → rpc('get_teacher_usage')): 이벤트+페이지+스토리지 바이트
create or replace function public.get_teacher_usage()
returns bigint language sql security definer set search_path = public as $$
  select
    coalesce((select sum(pg_column_size(e.payload)) from room_events e
              join rooms r on r.id = e.room_id where r.teacher_id = auth.uid()), 0)
  + coalesce((select sum(pg_column_size(p.canvas_json)) from room_pages p
              join rooms r on r.id = p.room_id where r.teacher_id = auth.uid()), 0)
  + coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o
              where o.bucket_id in ('backgrounds','captures')
                and (storage.foldername(o.name))[1] = auth.uid()::text), 0);
$$;
grant execute on function public.get_teacher_usage() to authenticated;


-- ===== 7. gift_codes + redeem_gift (단건 1개월권 / 선물) ==================
--   코드: billing/onetime/route.ts(발급, service_role), dashboard(등록 → rpc('redeem_gift')).
create table public.gift_codes (
  code        text primary key,
  plan        text not null default 'basic',            -- 'basic' | 'pro'
  days        int  not null default 30,
  buyer_id    uuid references auth.users(id) on delete set null, -- 구매자
  payment_key text,                                     -- Toss paymentKey (환불/추적)
  redeemed_by uuid references auth.users(id),           -- 사용한 계정(null=미사용)
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.gift_codes enable row level security;
create policy "구매자는 자기 코드 조회" on public.gift_codes for select using (auth.uid() = buyer_id);
grant select on public.gift_codes to authenticated;

-- 코드 사용: 로그인 계정에 days만큼 기간 추가 + 사용처리 (원자적). 코드 입력은 로그인 계정만.
create or replace function public.redeem_gift(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare g public.gift_codes;
begin
  select * into g from public.gift_codes where code = upper(p_code) for update;
  if g.code is null then return 'invalid'; end if;
  if g.redeemed_by is not null then return 'used'; end if;

  update public.profiles
    set current_period_end = greatest(coalesce(current_period_end, current_date), current_date)
                             + (g.days || ' days')::interval,
        plan   = g.plan,        -- 코드 등급 적용
        status = 'active'       -- billing_key 없음 → 크론이 자동청구 안 함(=단건)
    where id = auth.uid();

  update public.gift_codes set redeemed_by = auth.uid(), redeemed_at = now() where code = g.code;
  return 'ok';
end $$;
grant execute on function public.redeem_gift(text) to authenticated;


-- ===== 8. Storage 버킷 + 정책 =============================================
--   코드: storage.ts(uploadFileToCloud/uploadDataUrlToCloud → backgrounds/captures 폴더=auth.uid()).
insert into storage.buckets (id, name, public)
values ('backgrounds','backgrounds',true), ('captures','captures',true), ('replays','replays',true)
on conflict (id) do nothing;

drop policy if exists "layboad 업로드 본인폴더" on storage.objects;
create policy "layboad 업로드 본인폴더" on storage.objects for insert to authenticated
  with check ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "layboad 수정 본인폴더" on storage.objects;
create policy "layboad 수정 본인폴더" on storage.objects for update to authenticated
  using ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "layboad 삭제 본인폴더" on storage.objects;
create policy "layboad 삭제 본인폴더" on storage.objects for delete to authenticated
  using ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "layboad 읽기 공개" on storage.objects;
create policy "layboad 읽기 공개" on storage.objects for select
  using ( bucket_id in ('backgrounds','captures','replays') );  -- 배경/캡처 공개 읽기(학생도 배경 봄)


-- ===== 9. service_role 권한 (서버 라우트) =================================
--   코드: billing/*(route.ts)가 supabaseAdmin(service_role)로 profiles/gift_codes 접근.
--   ALTER DEFAULT PRIVILEGES = 앞으로 만들 테이블도 자동 부여.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;


-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
