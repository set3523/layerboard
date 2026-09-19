-- ============================================================
-- (선택) 로컬/스테이징 테스트 계정 — schema.sql 과 무관
--
-- ⚠️ Dashboard → Authentication → Add user 가 더 안전할 때도 많음.
--    GoTrue 버전마다 auth.users 컬럼이 다를 수 있음.
--
-- 사용: 삭제 주석 해제 → v_email / v_password 수정 → 추가 블록 실행
--       토큰 컬럼은 INSERT 시 '' (NULL 이면 로그인 500)
-- ============================================================

-- ---------- 추가 ----------
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_email text := 'innertest@example.com';   -- ← 이메일
  v_password text := 'innertest';        -- ← 비밀번호 (6자 이상)
  v_encrypted_pw text;
  v_instance_id uuid;
begin
  v_encrypted_pw := extensions.crypt(v_password, extensions.gen_salt('bf'));

  select id into v_instance_id from auth.instances limit 1;
  if v_instance_id is null then
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  ) values (
    v_user_id,
    v_instance_id,
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    timezone('utc', now()),  -- 이메일 인증 생략(바로 로그인)
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    '', '', '', '', '', '', '', '',
    false,
    false
  );

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  );

  insert into public.profiles (id, email, plan, status, trial_ends_at)
  values (
    v_user_id,
    v_email,
    'pro',              -- basic | pro — create_host_room 정원 테스트용
    'trialing',
    timezone('utc', now()) + interval '30 days'
  )
  on conflict (id) do update set
    email = excluded.email,
    plan = excluded.plan,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at;

  raise notice '임시 계정 생성: email=% user_id=%', v_email, v_user_id;
end $$;


-- ---------- 삭제 (추가 전에 같은 이메일 있으면 먼저 실행) ----------
-- delete from auth.users where email = 'innertest@example.com';
-- → profiles, rooms(host), room_members 등 auth.users FK cascade 로 같이 정리됨

-- id 로 지울 때:
-- delete from auth.users where id = '00000000-0000-0000-0000-000000000000'::uuid;
