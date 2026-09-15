-- ============================================================
-- layboad 마이그레이션: 이벤트 로그 + 사용량 측정
-- Supabase SQL Editor에서 한 번 실행하세요.
-- ============================================================

-- 1) 이벤트 로그 테이블 (append-only, id = 재생 순서)
create table if not exists public.room_events (
  id          bigserial primary key,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  page_index  int  not null default 0,
  type        text not null,                 -- 'add' | 'erase' | 'modify' | 'page' | 'bg'
  payload     jsonb not null,                -- add: 객체 JSON(자기 id 포함) / erase: {ids:[]} / page: {index}
  author_name text,
  author_role text,
  created_at  timestamptz not null default now()
);

create index if not exists room_events_room_id_id_idx
  on public.room_events (room_id, id);

-- 2) 방 삭제 시 페이지/이벤트도 같이 삭제되도록 cascade 보강
--    (기존 room_pages FK 이름이 다르면 아래 블록은 환경에 맞게 조정)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'room_pages_room_id_fkey'
      and table_name = 'room_pages'
  ) then
    alter table public.room_pages drop constraint room_pages_room_id_fkey;
  end if;
  alter table public.room_pages
    add constraint room_pages_room_id_fkey
    foreign key (room_id) references public.rooms(id) on delete cascade;
exception when others then
  raise notice 'room_pages FK 조정 건너뜀: %', sqlerrm;
end $$;

-- 3) 선생님별 저장 용량(바이트) 집계 RPC
--    이벤트 payload + 스냅샷 canvas_json 크기를 합산해서 반환.
create or replace function public.get_teacher_usage()
returns bigint
language sql
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(pg_column_size(e.payload))
      from public.room_events e
      join public.rooms r on r.id = e.room_id
      where r.teacher_id = auth.uid()
    ), 0)
    +
    coalesce((
      select sum(pg_column_size(p.canvas_json))
      from public.room_pages p
      join public.rooms r on r.id = p.room_id
      where r.teacher_id = auth.uid()
    ), 0);
$$;

-- ============================================================
-- 4) Storage 버킷 (대시보드 > Storage 에서 생성)
--    - backgrounds : 배경 PDF/이미지 (이미 사용 중)
--    - captures    : 화면 캡처 이미지
--    - replays     : 종료된 수업 재생 아카이브(gz) — 재생 기능 붙일 때 사용
--    셋 다 Public 으로 만들면 getPublicUrl 로 바로 접근됩니다.
--    (비공개로 가려면 signed URL 로직이 추가로 필요)
-- ============================================================

-- 참고: RLS 정책은 별도 설계 필요. 현재 클라이언트는 anon key 를 쓰므로
--       rooms / room_pages / room_events 에 적절한 정책이 없으면
--       teacher 만 쓰기 가능하도록 policy 를 꼭 추가하세요.
