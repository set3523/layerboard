# layboad 시스템 아키텍처 (Mermaid)

> 코드·스키마 기준 스냅샷. 상세 유지보수 설명은 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 참고.  
> 생성 시점 스택: `package.json` · `db/schema.sql` · `src/**`.

---

## 1. 기술 스택 & 외부 API 버전

| 계층 | 제품 / 패키지 | 버전(선언) | 비고 |
|------|----------------|------------|------|
| 프레임워크 | **Next.js** (App Router) | `16.2.7` | RSC + Client Components |
| UI | **React** / **React DOM** | `19.2.4` | |
| 언어 | **TypeScript** | `^5` | |
| 스타일 | **Tailwind CSS** | `^4` | `@tailwindcss/postcss` |
| 캔버스 | **fabric** | `^7.4.0` | Whiteboard 렌더 |
| 필기 | **perfect-freehand** | `^1.2.3` | 펜 스트로크 |
| PDF | **pdfjs-dist** | `^6.0.227` | 배경 PDF 페이지 rasterize |
| BaaS SDK | **@supabase/supabase-js** | `^2.108.1` | Auth + PostgREST + Realtime + Storage |
| 분석 | **@vercel/analytics** | `^2.0.1` | |
| 결제 (보류) | **Toss Payments REST** | **`v1`** | `https://api.tosspayments.com/v1` (`lib/toss.ts`) |
| 결제 (보류) | **Toss Payments JS SDK** | **`v2/standard`** | `https://js.tosspayments.com/v2/standard` |
| 배포 Cron | **Vercel Cron** | — | `vercel.json` → `GET /billing/renew` |

### Supabase 플랫폼 API (SDK가 호출하는 엔드포인트)

| Supabase 서브시스템 | 프로토콜 / 경로(일반) | layboad에서 쓰는 메서드 |
|---------------------|----------------------|-------------------------|
| **GoTrue Auth** | HTTPS `/auth/v1/*` | `signUp`, `signInWithPassword`, `signInWithOAuth`, `getSession`, `signOut`, `resend` |
| **PostgREST** | HTTPS `/rest/v1/*` | `.from('rooms'|'room_pages'|…).select/insert/upsert/delete` |
| **PostgREST RPC** | HTTPS `/rest/v1/rpc/<name>` | `.rpc('create_host_room', …)` 등 (아래 §5) |
| **Realtime** | WebSocket | `.channel().on('broadcast'|'postgres_changes').subscribe()` |
| **Storage** | HTTPS `/storage/v1/object/*` | `.storage.from('backgrounds'|'captures'|'replays').upload/download/createSignedUrl` |
| **Admin (서버)** | service_role | `supabaseAdmin` — billing 라우트 전용 |

---

## 2. 시스템 컨텍스트

```mermaid
flowchart TB
  subgraph Client["브라우저 (React 19)"]
    Pages["App Router 페이지"]
    WB["Whiteboard.tsx\nFabric 7"]
    SG["SessionGuard\n+ useIdleLogout"]
  end

  subgraph Vercel["Vercel / Next.js 16"]
    SSR["RSC / SSR"]
    API["Route Handlers\n/billing/*"]
    Cron["Cron → GET /billing/renew"]
  end

  subgraph Supabase["Supabase Project"]
    Auth["GoTrue Auth"]
    PG["PostgreSQL + RLS"]
    RT["Realtime"]
    ST["Storage buckets"]
  end

  subgraph External["외부 (선택)"]
    Toss["Toss API v1"]
    OAuth["Google OAuth"]
  end

  Pages --> WB
  Pages --> SG
  Client --> Auth
  Client --> PG
  Client --> RT
  Client --> ST
  API --> PG
  API --> Auth
  API --> Toss
  Cron --> API
  Auth --> OAuth
```

---

## 3. 앱 라우트 맵

```mermaid
flowchart LR
  subgraph Public
    L["/"]
    LG["/login"]
    PR["/pricing"]
    PV["/privacy"]
    TM["/terms"]
    RF["/refund"]
  end

  subgraph AuthGated["SessionGuard + 로그인"]
    DB["/dashboard"]
    JN["/join/:roomId"]
  end

  subgraph Room["SessionGuard idle=OFF"]
    RM["/room/:roomId\n?role=host|student&name="]
  end

  subgraph BillingUI["결제 UI"]
    BS["/billing/success"]
    BF["/billing/fail"]
    BO["/billing/onetime-success"]
  end

  subgraph BillingAPI["Next Route Handlers"]
    BI["POST /billing/issue"]
    BC["POST /billing/cancel"]
    BN["POST /billing/onetime"]
    BR["GET /billing/renew\nBearer CRON_SECRET"]
  end

  LG --> DB
  DB --> RM
  JN --> RM
  PR --> BI
  BS --> BI
```

---

## 4. 인증 · 기기 세션 · 미활동 로그아웃

**관련 코드:** `lib/supabase.ts`, `lib/api/auth.ts`, `lib/deviceSession.ts`, `components/SessionGuard.tsx`, `hooks/useIdleLogout.ts`, RPC `claim_session` / `release_session`.

```mermaid
sequenceDiagram
  autonumber
  actor U as 사용자
  participant LP as login/page.tsx
  participant Auth as GoTrue (supabase.auth)
  participant DS as deviceSession.ts
  participant PG as profiles (PostgREST)
  participant SG as SessionGuard
  participant RT as Realtime postgres_changes

  U->>LP: signInWithEmail / OAuth
  LP->>Auth: signInWithPassword / OAuth redirect
  Auth-->>LP: session (JWT access + refresh)
  LP->>DS: getDeviceSessionStatus()
  DS->>PG: SELECT active_session
  alt 다른 기기 active_session 존재
    LP->>U: confirm("다른 기기…")
    alt 취소
      LP->>Auth: signOut + release_session
    else 승인
      LP->>PG: RPC claim_session(p_token)
    end
  else 충돌 없음
    LP->>PG: RPC claim_session(p_token)
  end
  LP->>U: redirect /dashboard or next

  U->>SG: dashboard / join 진입
  SG->>DS: getDeviceSessionStatus()
  alt status=other
    SG->>U: 모달 (이 기기에서 계속 / 취소)
  else
    SG->>PG: claim_session
    SG->>RT: subscribe profiles UPDATE
  end

  Note over SG: enableIdleLogout=true (/room 제외)
  SG->>SG: 10분 무입력 → signOut + release_session → /login

  RT-->>SG: active_session ≠ myToken
  SG->>Auth: signOut (다른 기기가 claim)
```

| localStorage 키 | 용도 |
|-----------------|------|
| `sb-*-auth-token` | Supabase SDK 세션 (자동 refresh) |
| `layboad_session_token` | 기기 UUID (`SESSION_TOKEN_KEY`) |
| `room_{code}_state` | 방장 UI 상태 (페이지·bgOpacity) |

---

## 5. PostgreSQL RPC & REST (전체 목록)

### 5.1 RPC (`supabase.rpc(...)`)

| RPC 이름 | 인자 | 반환 | 호출처 | 처리 요약 |
|----------|------|------|--------|-----------|
| `create_host_room` | `p_passphrase: text` | `json` (room) | `rooms.createRoom` | 6자리 code, bcrypt 암호, plan별 max_students |
| `join_room` | `p_code`, `p_passphrase` | `text` enum | `rooms.joinRoom` | rate limit, crypt 검증, room_members insert |
| `get_room_by_code` | `p_code: text` | `setof rooms` | `board.getInternalRoomId`, `rooms.verifyRoomCode` | 코드→방 1건 (SECURITY DEFINER) |
| `start_trial` | — | `timestamptz` | `rooms.createRoom` (fire-and-forget) | 30일 trial_ends_at |
| `get_host_usage` | — | `bigint` | `usage.getUsageSummary`, `canStore` | events+pages+storage 바이트 |
| `claim_session` | `p_token: text` | void | `deviceSession`, SessionGuard | profiles.active_session 덮어쓰기 |
| `release_session` | `p_token: text` | void | `auth.signOut`, idle logout | 본인 토큰일 때만 NULL |
| `redeem_gift` | `p_code: text` | `text` | dashboard | gift_codes → profiles 기간 연장 |
| `is_active_room` | `rid: uuid` | boolean | RLS 내부 | — |
| `can_access_room` | `rid: uuid` | boolean | RLS 내부 | host 또는 room_members |
| `can_read_storage_object` | bucket, name | boolean | Storage RLS | — |
| `_record_join_failure` | — | void | join_room 내부 | — |

### 5.2 PostgREST 테이블 직접 접근

| 테이블 | 연산 | 호출처 | RLS |
|--------|------|--------|-----|
| `rooms` | SELECT, DELETE | `getHostRooms`, `deleteRoom` | host_id = auth.uid() |
| `room_pages` | SELECT, UPSERT, DELETE | `getRoomPages`, `saveRoomPages` | can_access_room / host write |
| `room_events` | INSERT, SELECT | `appendEvents`, `getRoomEvents` | 방 접근자 |
| `profiles` | SELECT | `usage`, SessionGuard, billing | auth.uid() = id |
| `gift_codes` | INSERT | `/billing/onetime` (admin) | service_role |

---

## 6. 방 생성 · 입장 · 칠판 진입

```mermaid
sequenceDiagram
  autonumber
  actor Host as 방장
  actor Stu as 학생
  participant DB as dashboard
  participant RM as rooms.ts
  participant RPC as Postgres RPC
  participant JN as join/:roomId
  participant RP as room/:roomId/page

  Host->>DB: createRoom(passphrase)
  DB->>RM: create_host_room
  RM->>RPC: create_host_room(p_passphrase)
  RPC-->>RM: { id, code, max_students, ... }
  RM->>RPC: start_trial()
  Host->>RP: /room/{code}?role=host

  Stu->>JN: 로그인 + 이름 + 암호
  JN->>RM: join_room(code, passphrase)
  RM->>RPC: join_room
  RPC-->>RM: ok | full | wrong_passphrase | ...
  JN->>RP: /room/{code}?role=student&name=

  RP->>RPC: get_room_by_code (verify)
  RP->>RP: getAccountStatus (host만 expired 차단)
  RP->>RP: Whiteboard mount
```

---

## 7. Whiteboard — Realtime · 저장 · Step

**채널:** `supabase.channel('room:{roomCode}')`  
**설정:** `broadcast: { self: false }`, `presence` track `{ role, name, joinedAt }`

### 7.1 Broadcast 이벤트

| event | 송신 | payload (요약) | 수신 처리 |
|-------|------|----------------|-----------|
| `draw` | 필기 완료 (path/text) | Fabric `toObject` + custom props | `applyRemoteDraw` → 방장 DB |
| `draw-live` | 그리는 중 (~50ms) | partial path | 렌더만, 저장 X |
| `erase` | 지우개/삭제 | `{ ids: string[] }` | canvas remove |
| `update-room-state` | 방장 | `RoomState` JSON | 학생 state + 수업모드 시 changePage |
| `sync-steps` | (legacy) 방장 | `{ steps, pageIndex, userName? }` | participantSteps 병합 |
| `sync-participant-steps` | 전원 | `{ pageIndex, userName, steps, activeStepId }` | pages[].participantSteps |
| `sync-bg` | 방장 | `{ bgOpacity }` | 배경 opacity |
| `sync-pages` | 방장 | `{ meta: background[] }` | PDF 메타만 (용량) |

### 7.2 영속화

```mermaid
flowchart TB
  subgraph Live["실시간 (비영구)"]
    B1["broadcast draw / erase / sync-*"]
  end

  subgraph Snap["스냅샷 (방장만)"]
    UP["updateCurrentPageJson()\ncanvas → pages[]"]
    SV["saveRoomPages()\n1s debounce"]
    T1["room_pages\nbackground, steps,\nparticipant_steps, canvas_json"]
  end

  subgraph Log["이벤트 로그 (방장)"]
    AE["appendEvents()"]
    T2["room_events\nadd | erase | page"]
  end

  subgraph CatchUp["지각 입장"]
    GR["getRoomPages()"]
    BUF["drawBuffer until readyRef"]
  end

  B1 --> UP
  UP --> SV --> T1
  B1 --> AE --> T2
  GR --> WB["canvas.loadFromJSON"]
  BUF --> WB
```

### 7.3 Step 데이터 모델 (참가자별)

```mermaid
erDiagram
  ROOM_PAGES {
    uuid room_id PK
    int page_index PK
    jsonb background
    jsonb steps "legacy 방장"
    jsonb participant_steps "Record name -> steps+activeStepId"
    jsonb canvas_json "objects with stepId authorName"
  }

  PARTICIPANT_BUNDLE {
    string id "step-1"
    string name
    boolean isVisible
    float opacity
  }

  ROOM_PAGES ||--o{ PARTICIPANT_BUNDLE : "participant_steps[name].steps"
```

**렌더:** `Whiteboard` 렌더 엔진 — 객체 `authorName` 기준 `getParticipantBundle()` → step opacity/visibility.

---

## 8. Storage · 배경 PDF

| 버킷 | API | 함수 | 경로 규칙 |
|------|-----|------|-----------|
| `backgrounds` | Storage upload / signedUrl | `uploadFileToCloud`, `prepareBackgroundImage` | `{auth.uid()}/…` |
| `captures` | Storage upload | `uploadDataUrlToCloud` | 클립보드·캡처 |
| `replays` | Storage upload (gzip) | `archiveRoomEvents` | `{room_uuid}.json.gz` |

```mermaid
sequenceDiagram
  participant WB as useBackgroundLoader
  participant ST as Storage API v1
  participant PDF as pdfjs-dist 6
  participant FAB as Fabric Canvas

  WB->>ST: upload PDF/image → path
  WB->>WB: pages[i].background = { type, path, pdfPageNumber }
  WB->>ST: download / signedUrl
  WB->>PDF: getDocument → render page
  PDF->>FAB: fabric.Image isBackground
  Note over FAB: canvas_json에는 배경 bitmap 미포함
```

---

## 9. 결제 (Toss — 코드 존재, 운영 보류)

```mermaid
sequenceDiagram
  autonumber
  participant UI as billingClient.ts
  participant TossJS as Toss SDK v2 standard
  participant Page as /billing/success
  participant API as POST /billing/issue
  participant Toss as api.tosspayments.com/v1
  participant Adm as supabaseAdmin

  UI->>TossJS: requestBillingAuth (CARD)
  TossJS->>Page: redirect ?authKey=
  Page->>API: POST Bearer access_token { authKey, plan }
  API->>Toss: POST /v1/billing/authorizations/issue
  API->>Toss: POST /v1/billing/{billingKey}
  API->>Adm: UPDATE profiles (plan, status, billing_key, …)

  Note over API: Cron GET /billing/renew\nBearer CRON_SECRET
  API->>Toss: chargeWithBillingKey (갱신)
```

| Toss REST (v1) | 메서드 | 함수 |
|----------------|--------|------|
| `/billing/authorizations/issue` | POST | `issueBillingKey` |
| `/billing/{billingKey}` | POST | `chargeWithBillingKey` |
| `/payments/confirm` | POST | `confirmPayment` (onetime) |

---

## 10. 컴포넌트 · 훅 의존 (칠판)

```mermaid
flowchart TB
  WB[Whiteboard.tsx]

  WB --> useSteps
  WB --> usePagination
  WB --> usePerfectFreehand
  WB --> useEraser
  WB --> useShape
  WB --> useCapture
  WB --> useCanvasClipboard
  WB --> useBackgroundLoader
  WB --> useBackgroundMode
  WB --> useTouchSwipe

  WB --> board_ts["lib/api/board.ts"]
  WB --> rooms_ts["lib/api/rooms.ts"]
  WB --> participantSteps["lib/participantSteps.ts"]

  WB --> HostControlPanel
  WB --> StepLayerPanel
  WB --> PeerViewPanel
  WB --> FloatingToolbar
  WB --> BottomBar

  usePagination --> PageData["PageData:\njson, background,\nsteps, participantSteps"]
```

---

## 11. DB ERD (핵심)

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : id
  AUTH_USERS ||--o{ ROOMS : host_id
  ROOMS ||--o{ ROOM_PAGES : room_id
  ROOMS ||--o{ ROOM_EVENTS : room_id
  ROOMS ||--o{ ROOM_MEMBERS : room_id
  AUTH_USERS ||--o{ ROOM_MEMBERS : user_id

  ROOMS {
    uuid id PK
    text code UK
    uuid host_id FK
    text passphrase_hash
    boolean is_active
    int max_students
  }

  PROFILES {
    uuid id PK
    text plan
    text status
    timestamptz trial_ends_at
    text active_session
    text billing_key
  }

  ROOM_PAGES {
    uuid id PK
    uuid room_id FK
    int page_index
    jsonb canvas_json
    jsonb participant_steps
  }

  ROOM_EVENTS {
    bigint id PK
    uuid room_id FK
    int page_index
    text type
    jsonb payload
  }
```

---

## 12. Auth API (클라이언트) — `lib/api/auth.ts`

| 함수 | Supabase Auth API |
|------|-------------------|
| `signUpWithEmail` | `auth.signUp({ email, password, options.emailRedirectTo })` |
| `signInWithEmail` | `auth.signInWithPassword` |
| `signInWithSocial` | `auth.signInWithOAuth({ provider: 'google' })` |
| `resendSignupVerificationEmail` | `auth.resend({ type: 'signup' })` |
| `signOut` | `release_session` RPC → `auth.signOut()` |
| `getCurrentUser` | `auth.getSession()` → `session.user` |

---

## 13. 환경 변수

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin` (billing) |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss JS v2 |
| `TOSS_SECRET_KEY` | Toss REST v1 Basic auth |
| `CRON_SECRET` | `/billing/renew` |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirect, OG |

---

## 14. DB 마이그레이션 순서

```mermaid
flowchart LR
  A["migration-wipe.sql"] --> B["schema.sql"]
  C["migrate-live.sql"] -.->|"운영 점진"| PG[(PostgreSQL)]
  B --> PG
  A --> PG
  D["dev/temp-user.sql"] -.->|"선택"| PG
```

---

*문서 끝 — Mermaid는 GitHub / GitLab / 많은 Markdown 뷰어에서 렌더됩니다.*
