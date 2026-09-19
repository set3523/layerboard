-- ============================================================
-- layboad — 전체 스키마 (CREATE 전용)
--
-- Supabase SQL Editor 실행 순서:
--
--   [A] 새로 깔기 / 데이터 전부 삭제 후 재설치
--       1) db/migration-wipe.sql
--       2) db/schema.sql  ← 이 파일 전체
--
--   [B] 이미 운영 중인 DB (테이블 유지, 컬럼만 추가 등)
--       → db/migrate-live.sql 만 실행
--
--   [C] (선택) 로컬 테스트 계정 — db/dev/temp-user.sql
--
-- ⚠️ [A]에서 wipe 없이 schema.sql 만 다시 실행하면 "already exists" 오류.
-- ============================================================


-- ===== 1. rooms (교실) ====================================================
--   코드: rooms.ts(createRoom/getHostRooms/deleteRoom), board.ts(코드→UUID),
--         room_pages/room_events FK 대상.
create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  host_id          uuid not null references auth.users(id) on delete cascade,
  passphrase_hash  text not null,                           -- join_room 검증용 (bcrypt, 평문 미저장)
  is_active        boolean not null default true,
  max_students     integer not null default 3,
  created_at       timestamptz not null default now()
);
alter table public.rooms enable row level security;

create policy "rooms 방장 조회" on public.rooms for select using (auth.uid() = host_id);
create policy "rooms 방장 삭제" on public.rooms for delete using (auth.uid() = host_id);

grant select, delete on public.rooms to authenticated;
-- insert: create_host_room RPC 만 (직접 insert 금지)

-- 입장 성공한 학생 (코드+암호 검증 후 join_room RPC)
create table public.room_members (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id)
);
alter table public.room_members enable row level security;
create policy "본인 멤버십 조회" on public.room_members for select using (auth.uid() = user_id);
grant select on public.room_members to authenticated;

-- join_room 실패 기록 — 계정당 분당 10회 초과 시 rate_limited
create table public.room_join_failures (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  failed_at  timestamptz not null default timezone('utc', now())
);
create index room_join_failures_user_time_idx on public.room_join_failures (user_id, failed_at desc);
alter table public.room_join_failures enable row level security;
-- 클라이언트 직접 접근 없음 (join_room SECURITY DEFINER 만 사용)


-- ===== 2. 헬퍼·입장 RPC (RLS·입장) =========================================
-- Supabase: pgcrypto 는 extensions 스키마 (search_path=public 만이면 gen_salt/crypt 42883)
create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_active_room(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.rooms where id = rid and is_active = true);
$$;
grant execute on function public.is_active_room(uuid) to authenticated;

-- 방장(host_id) 또는 join_room 으로 등록된 참가자만
create or replace function public.can_access_room(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid and r.is_active = true
      and (
        r.host_id = auth.uid()
        or exists (
          select 1 from public.room_members m
          where m.room_id = r.id and m.user_id = auth.uid()
        )
      )
  );
$$;
grant execute on function public.can_access_room(uuid) to authenticated;

create or replace function public.get_room_by_code(p_code text)
returns table (id uuid, code text, is_active boolean, host_id uuid, max_students integer)
language sql security definer stable set search_path = public as $$
  select r.id, r.code, r.is_active, r.host_id, r.max_students
  from public.rooms r
  where r.code = upper(trim(p_code)) and r.is_active = true
    and public.can_access_room(r.id)
  limit 1;
$$;
grant execute on function public.get_room_by_code(text) to authenticated;

create or replace function public._record_join_failure()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.room_join_failures (user_id) values (auth.uid());
  delete from public.room_join_failures
    where failed_at < timezone('utc', now()) - interval '1 hour';
end; $$;

-- returns: ok | invalid_code | wrong_passphrase | rate_limited | full | not_authenticated
create or replace function public.join_room(p_code text, p_passphrase text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.rooms;
  n_members int;
  fails int;
begin
  if auth.uid() is null then return 'not_authenticated'; end if;

  select count(*)::int into fails
  from public.room_join_failures
  where user_id = auth.uid()
    and failed_at > timezone('utc', now()) - interval '1 minute';
  if fails >= 10 then return 'rate_limited'; end if;

  select * into r from public.rooms
  where code = upper(trim(p_code)) and is_active = true
  limit 1;

  if r.id is null then
    perform public._record_join_failure();
    return 'invalid_code';
  end if;

  if r.host_id = auth.uid() then
    return 'ok';
  end if;

  if r.passphrase_hash is null or r.passphrase_hash <> extensions.crypt(trim(p_passphrase), r.passphrase_hash) then
    perform public._record_join_failure();
    return 'wrong_passphrase';
  end if;

  select count(*)::int into n_members from public.room_members where room_id = r.id;
  if n_members >= r.max_students then return 'full'; end if;

  insert into public.room_members (room_id, user_id)
  values (r.id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return 'ok';
end; $$;
grant execute on function public.join_room(text, text) to authenticated;

-- 방 생성 + 암호 해시 (rooms.ts createRoom). 정원은 profiles.plan 기준(클라와 동일).
create or replace function public.create_host_room(p_passphrase text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  new_code text;
  tries int := 0;
  row public.rooms;
  cap int := 3;
  user_plan text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(trim(p_passphrase)) < 4 then raise exception 'passphrase_too_short'; end if;

  select plan into user_plan from public.profiles where id = auth.uid();
  if user_plan = 'pro' then cap := 10;
  elsif user_plan = 'enterprise' then cap := 50;
  end if;
  cap := greatest(1, least(cap, 100));

  loop
    tries := tries + 1;
    if tries > 20 then raise exception 'code_generation_failed'; end if;
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.rooms where code = new_code);
  end loop;

  insert into public.rooms (code, host_id, passphrase_hash, is_active, max_students)
  values (
    new_code,
    auth.uid(),
    extensions.crypt(trim(p_passphrase), extensions.gen_salt('bf'::text)),
    true,
    cap
  )
  returning * into row;

  return json_build_object(
    'id', row.id,
    'code', row.code,
    'host_id', row.host_id,
    'is_active', row.is_active,
    'max_students', row.max_students,
    'created_at', row.created_at
  );
end; $$;
grant execute on function public.create_host_room(text) to authenticated;

-- 방장만: 입장 암호 재등록 (해시만 갱신, 서버에 평문 저장 안 함)
create or replace function public.set_host_room_passphrase(p_code text, p_passphrase text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  n int;
begin
  if auth.uid() is null then return 'not_authenticated'; end if;
  if length(trim(p_passphrase)) < 4 then return 'too_short'; end if;

  update public.rooms r
  set passphrase_hash = extensions.crypt(trim(p_passphrase), extensions.gen_salt('bf'::text))
  where r.code = upper(trim(p_code))
    and r.host_id = auth.uid()
    and r.is_active = true;

  get diagnostics n = row_count;
  if n = 0 then return 'not_found'; end if;
  return 'ok';
end; $$;
grant execute on function public.set_host_room_passphrase(text, text) to authenticated;


-- ===== 3. room_pages (페이지/필기 스냅샷) =================================
--   코드: board.ts(getRoomPages/saveRoomPages). 지각생 입장 시 여기서 로드.
create table public.room_pages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  page_index  integer not null,
  background  jsonb default '{}'::jsonb,   -- 배경(PDF url·pdfPageNumber 등) + 배경필기(drawingsJson)
  steps       jsonb default '[]'::jsonb,   -- legacy 방장 풀이 단계
  participant_steps jsonb not null default '{}'::jsonb, -- { displayName: { steps, activeStepId } }
  canvas_json jsonb default '{}'::jsonb,   -- 전경 필기 (배경 이미지는 넣지 않음 = 용량 방지)
  updated_at  timestamptz not null default timezone('utc', now()),
  unique(room_id, page_index)
);
alter table public.room_pages enable row level security;

create policy "방 접근자 페이지 조회" on public.room_pages for select
  using ( public.is_active_room(room_id) and public.can_access_room(room_id) );
create policy "방장 방 페이지 관리" on public.room_pages for all
  using ( exists (select 1 from public.rooms r where r.id = room_pages.room_id and r.host_id = auth.uid()) );

grant select, insert, update, delete on public.room_pages to authenticated;

-- Storage private 읽기 (room_pages 필요 → 테이블 생성 후 정의)
create or replace function public.can_read_storage_object(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (storage.foldername(p_name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.rooms r
      join public.room_pages p on p.room_id = r.id
      where r.host_id::text = (storage.foldername(p_name))[1]
        and public.can_access_room(r.id)
        and p_bucket in ('backgrounds', 'captures')
        and coalesce(p.background->>'path', '') = p_name
    );
$$;
grant execute on function public.can_read_storage_object(text, text) to authenticated;


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

create policy "방 접근자 이벤트 조회" on public.room_events for select
  using ( public.is_active_room(room_id) and public.can_access_room(room_id) );
create policy "방 접근자 이벤트 추가" on public.room_events for insert to authenticated
  with check ( public.is_active_room(room_id) and public.can_access_room(room_id) );
create policy "방장 방 이벤트 관리" on public.room_events for all
  using ( exists (select 1 from public.rooms r where r.id = room_events.room_id and r.host_id = auth.uid()) );

grant select, insert, update, delete on public.room_events to authenticated;
grant usage, select on all sequences in schema public to authenticated; -- bigserial 시퀀스


-- ===== 5. profiles (방장·계정: 요금제·결제·체험·세션) ==================
--   코드: usage.ts(getAccountStatus/getHostPlan), billing/*(routes), useSingleSession.
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


-- ===== 6. 계정 함수: start_trial / claim_session / get_host_usage ======
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

-- 로그아웃·미활동 로그아웃 시 이 기기 점유 해제 (auth.signOut / useIdleLogout)
create or replace function public.release_session(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set active_session = null
  where id = auth.uid() and active_session = p_token;
$$;
grant execute on function public.release_session(text) to authenticated;

-- 저장 용량 합산 (usage.ts → rpc('get_host_usage')): 이벤트+페이지+스토리지 바이트
create or replace function public.get_host_usage()
returns bigint language sql security definer set search_path = public as $$
  select
    coalesce((select sum(pg_column_size(e.payload)) from room_events e
              join rooms r on r.id = e.room_id where r.host_id = auth.uid()), 0)
  + coalesce((select sum(pg_column_size(p.canvas_json)) from room_pages p
              join rooms r on r.id = p.room_id where r.host_id = auth.uid()), 0)
  + coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o
              where o.bucket_id in ('backgrounds','captures')
                and (storage.foldername(o.name))[1] = auth.uid()::text), 0);
$$;
grant execute on function public.get_host_usage() to authenticated;


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
values ('backgrounds','backgrounds',false), ('captures','captures',false), ('replays','replays',false)
on conflict (id) do update set public = excluded.public;

create policy "layboad 업로드 본인폴더" on storage.objects for insert to authenticated
  with check ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

create policy "layboad 수정 본인폴더" on storage.objects for update to authenticated
  using ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

create policy "layboad 삭제 본인폴더" on storage.objects for delete to authenticated
  using ( bucket_id in ('backgrounds','captures') and (storage.foldername(name))[1] = auth.uid()::text );

create policy "layboad 읽기 인증" on storage.objects for select to authenticated
  using (
    bucket_id in ('backgrounds','captures','replays')
    and (
      public.can_read_storage_object(bucket_id, name)
      or (
        bucket_id = 'replays'
        and exists (
          select 1 from public.rooms r
          where r.id::text || '.json.gz' = name and r.host_id = auth.uid()
        )
      )
    )
  );


-- ===== 9. service_role 권한 (서버 라우트) =================================
--   코드: billing/*(route.ts)가 supabaseAdmin(service_role)로 profiles/gift_codes 접근.
--   ALTER DEFAULT PRIVILEGES = 앞으로 만들 테이블도 자동 부여.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;


-- ===== 10. anon 권한 회수 (로그인 필수 API) =================================
revoke select on public.rooms from anon;
revoke select on public.room_pages from anon;
revoke select, insert on public.room_events from anon;
revoke execute on function public.get_room_by_code(text) from anon;
revoke execute on function public.is_active_room(uuid) from anon;
revoke execute on function public.join_room(text, text) from anon;
revoke execute on function public.set_host_room_passphrase(text, text) from anon;


-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
