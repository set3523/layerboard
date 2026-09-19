-- ============================================================
-- layboad — 운영 중 DB 점진 반영 (CREATE 없음, idempotent)
-- ============================================================

alter table public.room_pages
  add column if not exists participant_steps jsonb not null default '{}'::jsonb;

comment on column public.room_pages.participant_steps is
  '참가자 표시이름 → { steps, activeStepId } (페이지별)';

-- 입장 암호 평문 컬럼·조회 RPC 제거 (해시만 유지)
drop function if exists public.get_host_room_passphrase(text);
alter table public.rooms drop column if exists entry_passphrase;

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
revoke execute on function public.set_host_room_passphrase(text, text) from anon;

create or replace function public.release_session(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set active_session = null
  where id = auth.uid() and active_session = p_token;
$$;
grant execute on function public.release_session(text) to authenticated;

notify pgrst, 'reload schema';
