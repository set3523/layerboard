# layboad 기술서 (아키텍처 · 저장 · 캐시)

> 유지보수용 단일 문서. 각 기능이 **어디서 정의**되고 **어디에 저장**되며 **캐시를 어떻게** 다루는지 정리.
> 코드 위치는 `src/...` 기준. DB 전체는 `db/schema.sql` 참고.  
> **다이어그램·API 전체 목록:** [`docs/MERMAID_README.md`](./MERMAID_README.md).

---

## 0. 스택 한눈에

| 영역 | 기술 |
|---|---|
| 프론트 | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| 캔버스 | Fabric.js v7, perfect-freehand, pdfjs-dist |
| 백엔드 | Supabase (Postgres + RLS, Realtime, Storage, Auth) |
| 결제 | Toss Payments v2 (**현재 보류** — 코드는 있음) |
| 배포 | Vercel (+ cron: `vercel.json`) |

**환경변수:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`.

---

## 1. 폴더 지도

```
src/
  app/            페이지·API 라우트 (App Router)
    page.tsx        랜딩   dashboard/  room/[roomId]/  (auth)/login/  pricing/
    billing/        issue · renew · cancel · onetime · *-success (결제 라우트)
    layout.tsx      전역 레이아웃 (+ <GlassGreen/> 디자인 스위치)
    globals.css     Tailwind + 디자인 규칙(.gg-*)
    sitemap.ts robots.ts manifest.ts
  components/
    Whiteboard.tsx        칠판 핵심 (캔버스·소켓·저장·렌더)
    HostControlPanel   방장 패널(참가자·학생통제·단계·배경)
    FloatingToolbar  BottomBar  Footer
    ui/GlassGreen.tsx     디자인 단일 프로바이더(테마+장식+물방울)
  hooks/
    usePerfectFreehand  useShape  useCapture  useEraser   (그리기 도구)
    usePagination  useBackgroundLoader  useBackgroundMode (페이지·배경)
    useSteps  useTouchSwipe  SessionGuard  useIdleLogout
  lib/
    supabase.ts  supabaseAdmin.ts   (클라이언트/서버 DB 접속)
    pointerInput.ts   (펜/손가락 판별 = 팜리젝션)
    billing.ts  billingClient.ts  toss.ts   (결제)
    api/  auth.ts  rooms.ts  board.ts  usage.ts  storage.ts
db/
    migration-wipe.sql   ① [A] 전체 재설치: public·Storage 정책 삭제
    schema.sql           ② [A] CREATE 전용 (wipe 다음)
    migrate-live.sql     ③ [B] 운영 DB 점진 반영 (예: participant_steps)
    dev/temp-user.sql    (선택) 테스트 계정
```

---

## 2. 인증 & 단일 세션

**정의:** `lib/api/auth.ts`, `lib/deviceSession.ts`, `components/SessionGuard.tsx`, `hooks/useIdleLogout.ts`.

- 세션은 항상 `supabase.auth.getSession()` 사용 → 만료 시 자동 갱신.
- **단일 기기:** `claim_session` / `release_session`. 다른 기기 로그인 중이면 확인 후 덮어쓰기, Realtime으로 기존 기기 로그아웃.
- **미활동:** `/room` 밖에서 10분 입력 없으면 자동 로그아웃.

**저장:** `auth.users`(Supabase 관리) · `public.profiles`(우리). 기기 토큰 = `localStorage["layboad_session_token"]`.
**캐시:** 세션/토큰은 Supabase SDK가 localStorage에 보관 + 자동 갱신.

---

## 3. 방 (rooms)

**정의:** `lib/api/rooms.ts` — `createRoom`(insert: code·host_id·is_active·max_students), `getHostRooms`, `deleteRoom`, `verifyRoomCode`(→ `get_room_by_code` RPC).

- 방 코드 = 6자리 랜덤. 정원(`max_students`) = 생성 시점 요금제 기준(`usage.getPlanStudentCap`)으로 **고정 저장**.
- 학생(비로그인)은 `rooms`를 직접 못 봄(목록 열거 차단) → **코드 1개만** `get_room_by_code`(SECURITY DEFINER)로 확인.

**저장:** `public.rooms` (id·code·host_id·is_active·max_students·created_at).
**캐시:** `lib/api/board.ts`의 `roomIdCache`(메모리 Record, 코드→UUID) — 자동저장 시 DB 재조회 방지.

---

## 4. 그리기 (도구)

**정의:** `hooks/usePerfectFreehand`(펜/형광펜), `useShape`(도형), `useCapture`(영역 캡처→이미지), `useEraser`(획 지우개). 각 훅이 `activeTool`에 따라 canvas `mouse:down/move/up`을 구독. 좌표는 **`scenePoint`**(줌/팬 보정된 논리 좌표).

- **입력 판별(팜리젝션):** `lib/pointerInput.ts`
  - `isDrawInput` — 펜/마우스만 필기. **손가락(touch)은 필기 금지**, 페이지 넘김 전용.
  - 일부 기기(삼성 S펜)는 Fabric 내부에서 펜이 `touch`로 들어옴 → **창(window) PointerEvent(type=pen)의 위치**를 `noteWindowPointer`로 기록(Whiteboard의 window pointer 리스너)하고, 터치가 그 펜과 **같은 위치·시각(60px·200ms)**이면 '펜의 터치'로 보고 허용. 손바닥은 펜 tip에서 멀어서 자동 제외.
- **지우개:** 본인 필기만(`authorName===userName`) + 현재 step만 + 겹친 획 한 번에. 우클릭/펜버튼은 즉시 지우기 제스처.
- 객체 태그: `object:added`에서 `id·stepId·authorName·authorRole·isBackground·isBackgroundDrawing` 부여.

**저장:** 로컬 캔버스(Fabric) → 완료 시 broadcast + (방장) DB. **캐시:** 없음(실시간 계산).

---

## 5. 페이지 & 배경 (PDF/이미지)

**정의:** `hooks/usePagination`(`changePage`: 현재 저장→배경 준비→캔버스 교체→`canvas:reloaded` fire), `hooks/useBackgroundLoader`.

- 업로드: `uploadFileToCloud` → **Supabase Storage에 저장** → `page.background = {type, url, pdfPageNumber, orientation, opacity}` **메타만** 보관.
- 렌더: `prepareBackgroundImage`가 `background.url`로 PDF를 pdfjs로 그려 `fabric.Image(isBackground)` 생성. **배경 이미지는 `canvas_json`에 넣지 않음**(용량 폭증 방지 — 로드 때 url로 재생성).
- 좌표계: `BOARD_WIDTH=1000` 고정 논리 폭 → 어느 기기서 그려도 배경·필기 정렬 일치.

**저장:** `room_pages`(background 메타 + steps + canvas_json) · Storage 버킷 `backgrounds`/`captures`/`replays`.
**캐시:**
- `pdfCache` (메모리 Record) — 로드된 PDF 문서 객체.
- `pageImageCache` (메모리 Map, **LRU 20장**) — 렌더된 페이지 이미지 dataURL. 20장 초과 시 가장 오래된 것 삭제.
- 앞뒤 ±1 페이지 **프리페치**(changePage 후 setTimeout).

---

## 6. 실시간 동기화 (Realtime)

**정의:** `Whiteboard.tsx`의 소켓 `useEffect` — Supabase Realtime 채널 `room:{roomId}` (broadcast + presence).

| 이벤트 | 방향 | 용도 | 영구저장? |
|---|---|---|---|
| `draw` | 완료 획 | 원격 렌더 + (방장) DB 저장 | ✅ |
| `draw-live` | 그리는 중(50ms throttle, 같은 id 교체) | 실시간 스트리밍 | ❌ |
| `erase` | 지우기 id들 | 원격 제거 | (방장) ✅ |
| `update-room-state` | 방장→학생 | 수업모드·페이지 이동 강제 | — |
| `sync-steps` | 방장→학생 | 풀이 단계(표시/투명도) | — |
| `sync-bg` | 방장→학생 | 배경 투명도 | — |
| `sync-pages` | 방장→학생 | PDF/페이지 메타 실시간(새 PDF만 lazy 로드) | — |
| presence | 전원 track `{role,name,joinedAt}` | 정원(roomFull) + 방장 참가자 명단(roster) | — |

- **지각 입장:** DB 스냅샷(`getRoomPages`) 로드 → 로딩 중 들어온 이벤트는 `drawBuffer`에 버퍼링(`readyRef`), 로드 끝나면 스냅샷 위에 재적용.
- 핵심: **실시간=broadcast(비영구)**, **영구=room_pages/room_events**로 분리.

---

## 7. 영속 저장 (Persistence)

**정의:** `lib/api/board.ts` (`getRoomPages`/`saveRoomPages`/`appendEvents`/`getRoomEvents`), `Whiteboard.updateCurrentPageJson`.

- **room_pages** = 페이지 스냅샷. **방장만** 자동저장(`saveRoomPages`, `pages` 변경 시 **1초 debounce**). `updateCurrentPageJson`이 전경필기(`json`)와 배경필기(`background.drawingsJson`)를 분리하고 **배경 이미지는 제외**.
- **room_events** = 이벤트 로그(`add`/`erase`/`page`) — 재생·역사용. `appendEvents`.
- 학생 필기도 **방장이 broadcast로 받아서** 자기 DB에 저장(`applyRemoteDraw` 내 `role==="host"`).
- 용량: `get_host_usage` RPC(events + pages + storage 바이트 합산) → `usage.canStore`로 초과 시 저장 중단(배너).

**저장:** `room_pages`, `room_events` (Postgres, jsonb).
**캐시:** `localStorage["room_{roomId}_state"]`(방장 방 상태: currentPageIndex·bgOpacity — 새로고침 복원).

---

## 8. 뷰포트 맞춤

**정의:** `Whiteboard.tsx`의 모듈 함수 `fitCanvasToView`. 배경 있으면 **그 페이지**, 없으면 **기본 프레임(1000×1414)** + 그린 내용의 합집합을 기준으로 전체가 화면에 딱 맞게 줌/이동. 로드·페이지전환·리사이즈·회전 시 호출(리사이즈 핸들러도 이 함수로 통일).

---

## 9. 요금제 · 결제 · 체험  (현재 Toss 보류)

**정의:** `lib/api/usage.ts`(`getAccountStatus`/`getHostPlan`/`getPlanStudentCap`), `lib/billing.ts`(가격·비례계산·주기), `lib/billingClient.ts`(결제창), `lib/toss.ts`(서버 Toss 호출), `app/billing/*`(라우트).

- **profiles** 컬럼: `plan·status·current_period_end·billing_key·customer_key·trial_ends_at·last_payment_key·past_due_since·pending_plan`.
- **무료체험:** 첫 방 생성 시 `start_trial` RPC(30일, 멱등). `getAccountStatus`가 trial/paid/expired/past_due 계산.
- **정기결제:** `startSubscription`→`requestBillingAuth`→`/billing/issue`(빌링키 발급+청구). 갱신 cron `/billing/renew`(하루 1회, `CRON_SECRET`). 해지 `/billing/cancel`.
- **단건/선물:** `gift_codes` + `redeem_gift` RPC. `startOneTime`→`requestPayment`→`/billing/onetime`(Toss `confirmPayment` 승인 → 코드 발급). 대시보드 "선물코드 등록"으로 사용. 코드 사용 시점부터 30일.
- **캐시:** `usage.ts`는 매번 `getSession` 기반 **fresh 조회**(이전 모듈 캐시 제거함).

> ⚠️ Toss 보류 상태. UI(요금제 토글·대시보드 등록)와 라우트·RPC·테이블은 존재하나, 실서비스 결제 흐름은 재개 시 검증 필요.

---

## 10. 디자인 시스템 (Glass Green)

**정의:** `app/globals.css`(토큰 + `.gg-*` 클래스) + `components/ui/GlassGreen.tsx`(**단일 스위치**, `layout.tsx`에 1줄).

- 색: `@theme --color-leaf-*`. 유리/물방울/라운드: `:root --gg-*`.
- 컴포넌트: `.gg-theme .gg-btn`(+`--primary/glass/ghost`, `--sm/lg/block`, `.gg-drop`=큰 버튼 물방울 터짐), `.gg-theme .gg-glass`.
- 장식: `.gg-decor` + `.gg-leaf`/`.gg-dew` — **위치·크기·낙하 전부 `nth-child` + `@keyframes`에 저장**. `<GlassGreen/>`가 노드만 뿌림(page마다 안 붙임). `z-index:-1`로 콘텐츠 뒤.
- **적용 방식:** `<GlassGreen/>` = 전역 스위치(제거하면 전부 사라짐). 페이지는 **opt-in**(배경 투명 + `gg-*` 클래스)해야 잎/유리가 보임. **현재 랜딩만 적용됨** — 나머지(대시보드·요금제·방·로그인)는 opt-in 대기.
- **캐시:** 없음(순수 CSS/런타임).

---

## 11. DB · RLS · RPC (요약, 전체는 `db/schema.sql`)

**테이블:** `rooms`, `room_pages`, `room_events`, `profiles`, `gift_codes`.

**RLS 원칙:**
- 방장(authenticated) = **자기 것만**(host_id/id = auth.uid()).
- 학생(anon) = **활성 방만** 조회(헬퍼 `is_active_room`), 이벤트 insert. rooms 직접조회 차단.
- 서버 라우트 = `service_role`(RLS 우회, billing).

**RPC(함수):** `is_active_room`, `get_room_by_code`, `get_host_usage`, `start_trial`, `claim_session`, `redeem_gift`, `handle_new_user`(가입 트리거).

**Storage:** `backgrounds`/`captures`/`replays` 버킷. 업로드는 `auth.uid()` 폴더에만, 읽기는 공개.

---

## 12. 캐시 총정리 (한눈에)

| 캐시 | 위치 | 담는 것 | 정책/수명 |
|---|---|---|---|
| `roomIdCache` | board.ts (메모리) | 방 코드 → UUID | 세션 동안 |
| `pdfCache` | useBackgroundLoader (메모리) | 로드된 PDF 문서 | 세션 동안 |
| `pageImageCache` | useBackgroundLoader (Map) | 렌더된 페이지 이미지 dataURL | **LRU 20장** |
| ±1 프리페치 | changePage | 앞뒤 배경 미리 렌더 | 전환 후 300ms |
| 세션/토큰 | Supabase SDK (localStorage) | access/refresh token | 자동 갱신 |
| `layboad_session_token` | localStorage | 기기 식별(단일 세션) | 영구(기기당) |
| `room_{id}_state` | localStorage | 방장 방 상태(페이지·투명도) | 영구 |
| Realtime broadcast | Supabase | 실시간 그리기/상태 | **비영구** |
| 요금제/계정 상태 | — | (캐시 제거) 매번 fresh | 없음 |

---

## 13. 유지보수 팁

- **디자인 톤 변경:** `globals.css`의 `--color-leaf-*`, `--gg-*`, `.gg-decor` nth-child만 수정하면 opt-in된 모든 페이지 자동 반영.
- **페이지 디자인 적용:** 해당 페이지 루트 배경을 투명으로 + 버튼/카드에 `gg-btn`/`gg-glass` 클래스.
- **DB 새 세팅/복구:** `db/migration-wipe.sql` → `db/schema.sql`. **운영 중 스키마만 올릴 때:** `db/migrate-live.sql`.
- **보안 하드닝(미완):** SECURITY DEFINER 함수들 `REVOKE EXECUTE ... FROM PUBLIC` + 필요한 롤만 GRANT (lint 참고). 유출비번 차단은 Auth 대시보드 토글.
- **결제 재개 시:** Toss 라이브 키 + `/billing/*` 흐름 + `gift_codes`/`redeem_gift` 검증.
