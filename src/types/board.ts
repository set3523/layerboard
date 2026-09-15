export type StudentVisibilityMode = "all" | "teacher" | "hidden"; // 모두 / 선생님만 / 숨김

export interface RoomState {
    isClassMode: boolean;          // 수업 모드 켜짐 여부 (학생들 화면 강제 고정)
    currentPageIndex: number;      // 현재 페이지 번호
    studentVisibilities: Record<string, { mode: StudentVisibilityMode; opacity: number }>; // 학생별 필기 공개범위
  }
  
  // 2. 각 페이지의 상태
  export interface PageState {
    background: {
      type: "pdf" | "image" | "none";
      url: string | null;          // 나중에 클라우드 URL이 들어갈 자리
      opacity: number;             // 배경 투명도 (0.1 ~ 1.0)
    };
    steps: StepState[];            // 그룹(레이어) 목록
    activeStepId: string;          // 현재 선택된 그룹
    canvasJson: any;               // 필기 데이터 (가벼움)
  }
  
  // 3. 그룹(레이어) 상태
  export interface StepState {
    id: string;
    name: string;
    isVisible: boolean;
    opacity: number;               // 레이어 투명도
  }
  
  // 4. 동기화용 전체 스냅샷
  export interface SyncSnapshot {
    roomState: RoomState;
    pages: PageState[];
  }

  // 5. 이벤트 로그 (재생/역사 원천)
  export type RoomEventType = "add" | "erase" | "modify" | "page" | "bg";

  export interface RoomEvent {
    id?: number;                 // bigserial, 서버가 매김 = 재생 순서
    page_index: number;
    type: RoomEventType;
    payload: any;                // add: 객체 JSON / erase: { ids: string[] } / page: { index }
    author_name?: string;
    author_role?: string;
    created_at?: string;
  }