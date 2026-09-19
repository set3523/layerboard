"use client";
import { supabase } from "@/lib/supabase";
import { getRoomPages, saveRoomPages, appendEvents } from "@/lib/api/board";
import { canStore } from "@/lib/api/usage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import { Loader2, Settings, BookOpen, RotateCw, Copy, Check, LogOut, Eye, EyeOff } from "lucide-react";

// 🧩 방금 분리해낸 우리의 레고 블록(컴포넌트)들 불러오기
import FloatingToolbar from "./FloatingToolbar";
import HostControlPanel from "./HostControlPanel";
import StepLayerPanel from "./StepLayerPanel";
import PeerViewPanel from "./PeerViewPanel";
import { getParticipantBundle, mergeParticipantSteps } from "../lib/participantSteps";
import {
  PeerLensState,
  collectAuthorStepIds,
  defaultPeerLensEntry,
} from "../lib/peerLens";
import { Step } from "../hooks/useSteps";
import BottomBar from "./BottomBar";

// 훅 및 타입 불러오기
import { useSteps } from "../hooks/useSteps"; 
import { useBackgroundLoader } from "../hooks/useBackgroundLoader";
import { usePerfectFreehand, BrushConfig, PenStyle } from "../hooks/usePerfectFreehand";
import { useEraser, eraseAtScenePoint } from "../hooks/useEraser";
import { useTouchSwipe } from "../hooks/useTouchSwipe";
import { noteWindowPointer } from "../lib/pointerInput";
import { useBackgroundMode } from "../hooks/useBackgroundMode";
import { useCapture } from "../hooks/useCapture";
import { useCanvasClipboard } from "../hooks/useCanvasClipboard";
import { usePagination } from "../hooks/usePagination"; 
import { useShape, ShapeType } from "../hooks/useShape";
import { RoomState } from "../types/board";
import { useRouter } from "next/navigation";
import { setHostRoomPassphrase } from "@/lib/api/rooms";
import {
  getPageDimensions,
  isInsidePageFrame,
  PageOrientation,
  roomPageOrientationKey,
} from "../lib/pageFormat";

interface WhiteboardProps {
  roomId: string;
  role: "host" | "student";
  userName: string;
  maxStudents?: number;
}

// 🆔 객체 고유 id 생성기 (실시간 동기화·이벤트 로그·재생의 기준 키)
const genId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// 직렬화 시 함께 보존할 커스텀 속성 (id 포함!)
const SERIALIZE_PROPS = [
  "id", "stepId", "originalOpacity", "selectable", "evented",
  "authorName", "authorRole", "isBackground", "isBackgroundDrawing", "isCapture", "isHostSolution",
];

// 📐 A4 페이지 프레임 전체가 화면에 최대한 크게 (바깥은 canvas 배경색 #000 레터박스)
function fitCanvasToView(canvas: fabric.Canvas, orientation: PageOrientation = "portrait") {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.setDimensions({ width: w, height: h });

  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  const { width: pw, height: ph } = getPageDimensions(orientation);
  const minX = -pw / 2;
  const minY = -ph / 2;
  const maxX = pw / 2;
  const maxY = ph / 2;
  const cw = pw;
  const ch = ph;
  const zoom = Math.min((w * 0.98) / (cw || w), (h * 0.98) / (ch || h));
  canvas.setZoom(zoom);
  const vpt = canvas.viewportTransform;
  if (vpt) {
    vpt[4] = w / 2 - ((minX + maxX) / 2) * zoom;
    vpt[5] = h / 2 - ((minY + maxY) / 2) * zoom;
  }
  canvas.requestRenderAll();
}

const Whiteboard = ({ roomId, role, userName, maxStudents = 3 }: WhiteboardProps) => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

  // 🛠️ 툴바 및 UI 상태
  const [activeTool, setActiveTool] = useState<"select" | "pen" | "highlighter" | "eraser" | "text" | "capture" | "shape">("pen");
  const [popoverOpen, setPopoverOpen] = useState<"pen" | "highlighter" | "shape" | null>(null);
  const [selectedShape, setSelectedShape] = useState<ShapeType>("rect");
  const [hasSelection, setHasSelection] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // 🎨 펜 및 형광펜 설정 상태
  const [penConfig, setPenConfig] = useState<{ color: string; size: number; style: PenStyle }>({ color: "#000000", size: 4, style: "fountain" });
  const [highlighterConfig, setHighlighterConfig] = useState({ color: "#add8e6", size: 24 });
  const [pdfFilePending, setPdfFilePending] = useState<File | null>(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  const currentConfig: BrushConfig = useMemo(() => ({
    tool: activeTool === "highlighter" ? "highlighter" : "pen",
    color: activeTool === "highlighter" ? highlighterConfig.color : penConfig.color,
    size: activeTool === "highlighter" ? highlighterConfig.size : penConfig.size,
    penStyle: activeTool === "pen" ? penConfig.style : undefined,
  }), [activeTool, highlighterConfig, penConfig]);

  const [roomState, setRoomState] = useState<RoomState>({
    isClassMode: false,
    currentPageIndex: 0,
    studentVisibilities: {},
    allowStudentBackgroundEdit: false,
  });
  const [hostControlMode, setHostControlMode] = useState(true);

  const defaultPageOrientationRef = useRef<PageOrientation>("portrait");
  useEffect(() => {
    const stored = localStorage.getItem(roomPageOrientationKey(roomId));
    if (stored === "portrait" || stored === "landscape") {
      defaultPageOrientationRef.current = stored;
    }
  }, [roomId]);

  const pageOrientationRef = useRef<PageOrientation>("portrait");
  const allowDrawAtRef = useRef<(x: number, y: number) => boolean>(() => true);
  allowDrawAtRef.current = (x, y) =>
    isInsidePageFrame(x, y, pageOrientationRef.current);

  // 📦 비즈니스 로직 훅들 연동
  const { steps, setSteps, activeStepId, setActiveStepId } = useSteps();
  const { pages, setPages, currentPageIndex, setCurrentPageIndex, changePage, nextPage, prevPage, deletePage } = usePagination(
    canvas,
    steps,
    setSteps,
    activeStepId,
    setActiveStepId,
    userName,
    role === "host",
    defaultPageOrientationRef
  );

  useEffect(() => {
    const o =
      (pages[currentPageIndex]?.background?.orientation as PageOrientation) ||
      defaultPageOrientationRef.current;
    pageOrientationRef.current = o;
  }, [pages, currentPageIndex]);
  const [peerLens, setPeerLens] = useState<PeerLensState>({});
  const { handleFileUpload, isLoading } = useBackgroundLoader(canvas, pages, currentPageIndex, setPages, changePage);
  const { mode, setMode, selectedImage } = useBackgroundMode(canvas);

  const [activeStudents, setActiveStudents] = useState<string[]>([]);
  const [roster, setRoster] = useState<{ name: string; joinedAt: number }[]>([]); // 👥 현재 접속 중인 학생(presence 기반)
  const [channel, setChannel] = useState<any>(null);
  const channelRef = useRef<any>(null);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  
  const hasJoined = useRef(false);
  const pagesRef = useRef(pages);
  const currentPageIndexRef = useRef(currentPageIndex);
  const [bgOpacity, setBgOpacity] = useState<number>(1);
  const [renderTick, setRenderTick] = useState(0); // 페이지 로드 완료 후 렌더 엔진 재실행 트리거
  // 🎯 1. 지우개 히트박스(커서)를 위한 상태
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);
  const [eraseGestureOn, setEraseGestureOn] = useState(false); // 우클릭/펜버튼 지우개 커서 표시용
  const [uiHidden, setUiHidden] = useState(false); // 좌우 패널 숨기기(수업 중 캔버스 넓게)
  const boardFocusRef = useRef<HTMLDivElement>(null);

  // 🪄 2. 우클릭(마우스) · 펜 배럴/지우개 버튼으로 '즉시 지우기' 제스처 판단용 Ref
  const eraseGesture = useRef(false);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { currentPageIndexRef.current = currentPageIndex; }, [currentPageIndex]);

  const canUseBackgroundEdit =
    role === "host" ? hostControlMode : roomState.allowStudentBackgroundEdit;

  useEffect(() => {
    if (!canUseBackgroundEdit && mode === "edit") setMode("class");
  }, [canUseBackgroundEdit, mode, setMode]);

  // 🚦 용량 초과(요금제 한도) 여부
  const [storageFull, setStorageFull] = useState(false);
  const storageFullRef = useRef(false);
  useEffect(() => { storageFullRef.current = storageFull; }, [storageFull]);

  // 👥 방 정원(학생 동시 입장) 초과 여부 — presence 로 판정
  const [roomFull, setRoomFull] = useState(false);

  // 🐢 지각생 catch-up: 스냅샷 로딩이 끝나기 전 들어온 실시간 이벤트를 잠시 버퍼링
  const readyRef = useRef(false);
  const drawBufferRef = useRef<{ t: "draw" | "erase"; data?: any; ids?: string[] }[]>([]);

  // 🔁 stale closure 방지용: 최신 changePage 를 ref 로 유지 (소켓 핸들러에서 사용)
  const changePageRef = useRef(changePage);
  useEffect(() => { changePageRef.current = changePage; });

  // 📝 학생 리스트 스캔
  const extractStudents = (currentCanvas: fabric.Canvas) => {
    const students = new Set<string>();
    currentCanvas.getObjects().forEach((obj: any) => {
      if (obj.authorRole === "student" && obj.authorName) students.add(obj.authorName);
    });
    setActiveStudents(Array.from(students));
  };

  // ✨ 방장이 설정을 바꿀 때마다 소켓으로 쏘는 통합 함수
  const applyParticipantStepsToPage = React.useCallback(
    (pageIndex: number, name: string, bundle: { steps: Step[]; activeStepId: string }) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[pageIndex];
        if (!page) return prev;
        const participantSteps = mergeParticipantSteps(page, name, bundle);
        next[pageIndex] = {
          ...page,
          participantSteps,
          ...(role === "host" && name === userName
            ? { steps: bundle.steps, activeStepId: bundle.activeStepId }
            : {}),
        };
        return next;
      });
    },
    [role, userName]
  );

  const emitParticipantSteps = React.useCallback(
    (newSteps: Step[], nextActiveId: string) => {
      const pageIndex = currentPageIndexRef.current;
      applyParticipantStepsToPage(pageIndex, userName, {
        steps: newSteps,
        activeStepId: nextActiveId,
      });
      setSteps(newSteps);
      setActiveStepId(nextActiveId);
      setRenderTick((t) => t + 1);
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "sync-participant-steps",
          payload: { pageIndex, userName, steps: newSteps, activeStepId: nextActiveId },
        });
      }
    },
    [applyParticipantStepsToPage, userName]
  );

  const updateRoomState = (updates: Partial<RoomState>) => {
    if (role !== "host" || !channel) return;
    const newState = { ...roomState, ...updates };
    setRoomState(newState);
    
    // 🟢 가벼운 동기화: socket.emit 대신 Broadcast!
    channel.send({
      type: "broadcast",
      event: "update-room-state",
      payload: newState
    });
  };
  const [showCopyToast, setShowCopyToast] = useState(false);

  const handleReregisterPassphrase = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = window.prompt(
      "새 입장 암호를 입력하세요. (4자 이상)\n학생은 이 암호로 입장합니다. 서버에는 해시만 저장됩니다."
    );
    if (input == null) return;
    const trimmed = input.trim();
    if (trimmed.length < 4) {
      alert("4자 이상 입력해 주세요.");
      return;
    }
    try {
      const res = await setHostRoomPassphrase(roomId, trimmed);
      if (res !== "ok") {
        alert("암호 재등록에 실패했습니다. 방 코드와 방장 계정을 확인해 주세요.");
        return;
      }
      alert("입장 암호가 변경되었습니다. 학생에게 새 암호를 알려 주세요.");
    } catch {
      alert("암호 재등록 중 오류가 발생했습니다.");
    }
  };

  // 3️⃣ 클립보드 복사 및 토스트 알림 함수
  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (err) {
      console.error("복사에 실패했습니다.", err);
      alert("복사에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const router = useRouter();

  // 🟢 방 나가기 함수
  const handleExit = () => {
    const isConfirm = window.confirm(
      role === "host" 
        ? "수업을 종료하고 방에서 나가시겠습니까?\n(현재까지의 내용은 자동 저장됩니다.)" 
        : "방에서 나가시겠습니까?"
    );

    if (isConfirm) {
      // 방장이 나갈 때는 '최후의 안전망'을 한 번 더 수동으로 작동시킴!
      if (role === "host" && pagesRef.current && pagesRef.current.length > 0) {
        saveRoomPages(roomId, pagesRef.current).catch(console.error);
      }
      
      // 메인 화면(또는 대시보드)으로 튕겨내기
      router.push("/dashboard"); // 👈 만약 돌아갈 페이지 주소가 다르면 "/" 부분을 수정해 주세요!
    }
  };

  // 🧽 지우개로 지웠을 때: 다른 참가자 동기화 + 이벤트 로그 (메모이즈로 매 렌더 리바인드 방지)
  const handleErase = React.useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (channel) channel.send({ type: "broadcast", event: "erase", payload: { ids } });
    if (role === "host" && !storageFullRef.current) {
      appendEvents(roomId, [{ page_index: currentPageIndexRef.current, type: "erase", payload: { ids }, author_name: userName, author_role: role }]);
    }
    updateCurrentPageJson();
  }, [channel, role, roomId, userName]);

  // 📸 캡처 완료 → 선택 툴로 전환 (안정 콜백)
  const handleCaptureDone = React.useCallback(() => {
    setActiveTool("select");
    setPopoverOpen(null);
  }, []);

  const noopComplete = React.useCallback(() => {}, []);

  // 📡 실시간 스트리밍: 그리는 중 부분 획을 'draw-live'로 전송 (저장은 완료 시점 onFinalize에서만)
  const handleLiveStroke = React.useCallback((path: fabric.Path) => {
    if (!channelRef.current) return;
    const data = (path as any).toObject(SERIALIZE_PROPS);
    channelRef.current.send({ type: "broadcast", event: "draw-live", payload: data });
  }, []);

  usePerfectFreehand(
    canvas,
    currentConfig,
    activeTool === "pen" || activeTool === "highlighter",
    handleLiveStroke,
    allowDrawAtRef
  );
  const eraserStepId = activeStepId;
  useEraser(canvas, activeTool === "eraser", eraserStepId, mode === "edit", userName, handleErase);
  useCapture(canvas, activeTool === "capture", handleCaptureDone);
  useCanvasClipboard(canvas, true, storageFullRef);
  useShape(
    canvas,
    activeTool === "shape",
    selectedShape,
    currentConfig.color,
    currentConfig.size,
    noopComplete,
    allowDrawAtRef
  );

  // 👆 손가락 가로 스와이프 → 페이지 넘김 (펜/마우스=필기, 손가락=이동)
  useTouchSwipe(!!canvas, nextPage, prevPage);

  // 🖊️ 창(window)에서 펜(type=pen)의 위치를 계속 기록 → 필기/지우기 판정 시 '펜 vs 손' 위치 대조에 사용.
  //    (capture 단계라 Fabric보다 먼저 실행 → 펜 위치가 최신 상태로 반영됨)
  useEffect(() => {
    const note = (e: PointerEvent) => noteWindowPointer(e);
    window.addEventListener("pointerdown", note, { capture: true, passive: true });
    window.addEventListener("pointermove", note, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", note, true);
      window.removeEventListener("pointermove", note, true);
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;

    // 우클릭(마우스) · 펜 배럴버튼 · 펜 지우개꼭지 = 모두 '즉시 지우기' 제스처.
    //  버튼2 = 마우스 우클릭 & 펜 몸통버튼(코드 동일), 버튼5/buttons&32 = 펜 뒷부분 지우개.
    const isEraseGesture = (e: PointerEvent) =>
      e.button === 2 || e.button === 5 || (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0;

    const overCanvas = (e: PointerEvent) => e.target instanceof HTMLCanvasElement;

    // 원래 지우개(useEraser)와 완전히 동일한 로직을 직접 호출 → 툴 전환/비동기 없음
    const doErase = (e: PointerEvent) => {
      const pointer = canvas.getScenePoint(e);
      const ids = eraseAtScenePoint(canvas, pointer, eraserStepId, mode === "edit", userName);
      if (ids.length > 0) handleErase(ids);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (isEraseGesture(e) && overCanvas(e)) {
        e.preventDefault();
        eraseGesture.current = true;
        setEraseGestureOn(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        doErase(e);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      // 지우개 커서(빨간 원) 위치 갱신 — 툴 지우개 또는 제스처 지우개일 때
      if (activeTool === "eraser" || eraseGesture.current) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
      // 제스처 지우개: 버튼 누른 채 드래그하면 계속 지움 (겹친 획도 한 번에)
      if (eraseGesture.current && isEraseGesture(e) && overCanvas(e)) {
        doErase(e);
      }
    };

    const handlePointerUp = () => {
      if (eraseGesture.current) {
        eraseGesture.current = false;
        setEraseGestureOn(false);
      }
    };

    // 우클릭 지우개 시 브라우저 컨텍스트 메뉴 차단 (캔버스 위에서만)
    const handleContextMenu = (e: MouseEvent) => {
      if (e.target instanceof HTMLCanvasElement) e.preventDefault();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [canvas, activeTool, eraserStepId, mode, handleErase]);
  // 🌐 소켓 통신 (생략 없이 원본 유지)
  useEffect(() => {
    if (!canvas) return;
  
    // 받은 그리기 1건 적용 (id 같으면 교체 → 중간 조각 누적/중복 방지)
    const applyRemoteDraw = (data: any, save = true) => {
      fabric.util.enlivenObjects([data]).then((objects: any[]) => {
        const obj: any = objects[0];
        if (!obj) return;
        const prev = canvas.getObjects().find((o: any) => o.id && o.id === obj.id);
        if (prev) canvas.remove(prev);
        obj.set({ isRemote: true });
        canvas.add(obj);
        extractStudents(canvas);
        canvas.requestRenderAll();
        // 방장은 받은(학생) 필기도 영구 저장 (실시간 스트리밍 중간조각 save=false → 저장 안 함)
        if (role === "host" && save) {
          updateCurrentPageJson();
          if (!storageFullRef.current) {
            appendEvents(roomId, [{ page_index: currentPageIndexRef.current, type: "add", payload: data, author_name: data.authorName, author_role: data.authorRole }]);
          }
        }
      });
    };

    // 받은 지우기 적용
    const applyRemoteErase = (ids: string[]) => {
      if (!ids || !ids.length) return;
      const set = new Set(ids);
      canvas.getObjects().filter((o: any) => set.has(o.id)).forEach((o) => canvas.remove(o));
      canvas.requestRenderAll();
      if (role === "host") updateCurrentPageJson();
    };

    // 🌟 1. [스냅샷 catch-up] 입장 시 DB에서 현재 상태를 한 번에 불러오기
    const loadInitialData = async () => {
      try {
        let targetPage = 0;
        let savedState: any = null;
        
        if (role === "host") {
          const savedStateStr = localStorage.getItem(`room_${roomId}_state`);
          if (savedStateStr) {
            try {
              savedState = JSON.parse(savedStateStr);
              if (typeof savedState.currentPageIndex === "number") {
                targetPage = savedState.currentPageIndex;
              }
              // 🎨 전역 배경 투명도 복원 (새로고침해도 유지)
              if (typeof savedState.bgOpacity === "number") setBgOpacity(savedState.bgOpacity);
            } catch (e) { console.error("상태 복원 에러:", e); }
          }
        }

        const loadedPages = await getRoomPages(roomId);
        console.log("[입장진단] room_pages 로드:", loadedPages?.length ?? 0, "페이지 / 페이지별 객체수:",
          loadedPages?.map((p: any) => (p.canvas_json?.objects?.length ?? 0)));
        if (loadedPages && loadedPages.length > 0) {
          const formattedPages = loadedPages.map((p: any) => {
            const participantSteps = p.participant_steps ?? {};
            const legacySteps = Array.isArray(p.steps) ? p.steps : [];
            const hostBundle = getParticipantBundle(
              { steps: legacySteps, participantSteps, activeStepId: legacySteps[legacySteps.length - 1]?.id },
              userName,
              role === "host" ? userName : undefined
            );
            return {
              json: p.canvas_json,
              background: p.background,
              steps: role === "host" && legacySteps.length ? legacySteps : hostBundle.steps,
              activeStepId: hostBundle.activeStepId,
              participantSteps:
                Object.keys(participantSteps).length > 0
                  ? participantSteps
                  : role === "host" && legacySteps.length
                    ? { [userName]: { steps: legacySteps, activeStepId: hostBundle.activeStepId } }
                    : {},
            };
          });

          setPages(formattedPages);

          if (savedState) setRoomState(savedState);

          if (targetPage >= formattedPages.length) targetPage = formattedPages.length - 1;
          if (targetPage < 0) targetPage = 0;

          await changePage(targetPage, formattedPages);
          console.log("[입장진단] 페이지", targetPage, "로드 후 캔버스 객체 수:", canvas.getObjects().length);
        } else {
          console.log("[입장진단] 로드된 페이지 없음 (빈 방이거나 저장 안 됨)");
          await changePage(0);
        }

        // 방장이면 용량 한도 확인 (배너 표시용)
        if (role === "host") {
          canStore().then((ok) => setStorageFull(!ok)).catch(() => {});
        }
      } catch (error) {
        console.error("초기 데이터 로드 실패:", error);
      } finally {
        // 🐢 catch-up 완료 → 입장 중 버퍼링된 실시간 이벤트를 스냅샷 위에 적용
        readyRef.current = true;
        const buffered = drawBufferRef.current;
        drawBufferRef.current = [];
        buffered.forEach((b) => {
          if (b.t === "draw") applyRemoteDraw(b.data);
          else applyRemoteErase(b.ids || []);
        });
        setIsInitialLoadComplete(true);
      }
    };
  
    // 1번만 실행 (지각생이든 방장이든 입장 시 DB 읽기)
    if (!hasJoined.current) {
      loadInitialData();
      hasJoined.current = true;
    } else {
      readyRef.current = true; // effect 재실행(StrictMode 등) 시 실시간 바로 적용
    }
  
    // 🌟 2. [가벼운 동기화] Supabase Realtime (Broadcast) 채널 파기
    let active = true; // dev StrictMode 이중 마운트 시 죽은 채널을 state 로 세팅하지 않도록 가드
    const myPid = `${role}_${Math.random().toString(36).slice(2)}`; // 이 클라이언트의 고유 presence 키
    const roomChannel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false }, // 내가 보낸 건 내가 다시 받지 않음
        presence: { key: myPid },
      },
    });
  
    roomChannel
      .on("presence", { event: "sync" }, () => {
        // 학생들을 입장순(joinedAt)으로 정렬해, '내 순번'이 정원을 넘을 때만 나 자신을 차단.
        // (기존엔 정원+1명이 들어오면 기존 학생들까지 다 같이 튕기던 버그 → 초과한 본인만 막힘)
        const state: any = roomChannel.presenceState();
        const list: { key: string; name: string; joinedAt: number }[] = [];
        Object.entries(state).forEach(([key, metas]: [string, any]) =>
          metas.forEach((p: any) => { if (p.role === "student") list.push({ key, name: p.name || "학생", joinedAt: p.joinedAt ?? 0 }); })
        );
        list.sort((a, b) => (a.joinedAt - b.joinedAt) || a.key.localeCompare(b.key));
        if (role === "student") {
          const myRank = list.findIndex((s) => s.key === myPid);
          setRoomFull(myRank >= maxStudents); // 정원 내면 false(자동 복구), 초과면 true
        }
        // 👥 방장: 현재 접속 중인 학생 명단(닉네임+입장순) 실시간 갱신
        if (role === "host") setRoster(list.map((s) => ({ name: s.name, joinedAt: s.joinedAt })));
      })
      .on("broadcast", { event: "draw" }, (payload) => {
        // 입장(스냅샷 로딩) 중이면 버퍼링, 끝났으면 바로 적용
        if (!readyRef.current) { drawBufferRef.current.push({ t: "draw", data: payload.payload }); return; }
        applyRemoteDraw(payload.payload);
      })
      .on("broadcast", { event: "draw-live" }, (payload) => {
        // 실시간 스트리밍(그리는 중) — 렌더만, 저장 X. 입장 로딩 중이면 무시(완성본이 곧 옴)
        if (!readyRef.current) return;
        applyRemoteDraw(payload.payload, false);
      })
      .on("broadcast", { event: "erase" }, (payload) => {
        const ids: string[] = payload.payload?.ids || [];
        if (!readyRef.current) { drawBufferRef.current.push({ t: "erase", ids }); return; }
        applyRemoteErase(ids);
      })
      .on("broadcast", { event: "update-room-state" }, (payload) => {
        // 방장이 방 상태(수업모드, 페이지 이동 등) 바꿨을 때 강제 동기화
        const newState = payload.payload;
        setRoomState((prev) => ({
          ...prev,
          ...newState,
          allowStudentBackgroundEdit:
            newState.allowStudentBackgroundEdit ?? prev.allowStudentBackgroundEdit ?? false,
        }));
        if (role === "student" && newState.isClassMode && newState.currentPageIndex !== currentPageIndexRef.current) {
          changePageRef.current(newState.currentPageIndex);
        }
      })
      .on("broadcast", { event: "sync-steps" }, (payload) => {
        const newSteps = payload.payload?.steps;
        const pageIndex = payload.payload?.pageIndex;
        if (!Array.isArray(newSteps) || typeof pageIndex !== "number") return;
        const hostName = payload.payload?.userName ?? payload.payload?.hostName;
        if (!hostName) return;
        applyParticipantStepsToPage(pageIndex, hostName, {
          steps: newSteps,
          activeStepId: newSteps[newSteps.length - 1]?.id ?? "step-1",
        });
        if (hostName !== userName && pageIndex === currentPageIndexRef.current) {
          setRenderTick((t) => t + 1);
        }
      })
      .on("broadcast", { event: "sync-participant-steps" }, (payload) => {
        const { pageIndex, userName: author, steps: newSteps, activeStepId: aid } = payload.payload ?? {};
        if (typeof pageIndex !== "number" || !author || !Array.isArray(newSteps)) return;
        applyParticipantStepsToPage(pageIndex, author, {
          steps: newSteps,
          activeStepId: aid ?? newSteps[0]?.id ?? "step-1",
        });
        if (author === userName && pageIndex === currentPageIndexRef.current) {
          setSteps(newSteps);
          if (aid) setActiveStepId(aid);
        }
        setRenderTick((t) => t + 1);
      })
      .on("broadcast", { event: "sync-bg" }, (payload) => {
        // 방장이 배경 투명도를 바꾸면 학생 화면도 똑같이
        if (role !== "student") return;
        const v = payload.payload?.bgOpacity;
        if (typeof v === "number") { setBgOpacity(v); setRenderTick((t) => t + 1); }
      })
      .on("broadcast", { event: "sync-pages" }, (payload) => {
        // 방장이 PDF/페이지를 추가·삭제하면 학생도 페이지 메타(배경 url·steps)를 받아 반영.
        //  실제 PDF 이미지는 학생이 그 페이지로 이동할 때 storage에서 lazy 렌더 → '새로 추가된 PDF만' 추가 로드.
        if (role !== "student") return;
        const meta = payload.payload?.meta;
        if (!Array.isArray(meta)) return;
        setPages((prev) => {
          const next = [...prev];
          meta.forEach((m: any, i: number) => {
            if (next[i]) {
              // 기존 페이지: 배경 메타만 갱신(필기 json 보존)
              next[i] = {
                ...next[i],
                background: {
                  ...(next[i].background || { type: "none", url: null, opacity: 1 }),
                  ...(m.background || {}),
                },
                steps: m.steps || next[i].steps,
                participantSteps: m.participantSteps ?? next[i].participantSteps,
              };
            } else {
              const def = [{ id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }];
              next[i] = {
                json: null,
                background: m.background || { type: "none", url: null, opacity: 1 },
                steps: m.steps || def,
                activeStepId: "step-1",
                participantSteps: m.participantSteps ?? {},
              };
            }
          });
          return next;
        });
      })
      // 🌟 핵심 수정: 완벽하게 연결되었을 때만 채널 상태를 세팅!
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && active) {
          console.log("🟢 실시간 연결 완료!");
          setChannel(roomChannel);
          roomChannel.track({ role, name: userName, joinedAt: Date.now() }); // presence 등록 (정원 계산용)
        }
      });
  
    // 방 나갈 때 채널 연결 끊기
    return () => {
      active = false;
      supabase.removeChannel(roomChannel);
    };
  }, [canvas, roomId, role, userName, applyParticipantStepsToPage]);

  // 🚀 마법의 렌더링 엔진
  useEffect(() => {
    if (!canvas) return;

    const applyStepLayer = (obj: any, list: Step[], baseVisible: boolean, baseOpacity: number) => {
      if (!obj.stepId) return { isVisible: baseVisible, opacity: baseOpacity };
      const sc = list.find((s) => s.id === obj.stepId);
      if (!sc) return { isVisible: baseVisible, opacity: baseOpacity };
      return {
        isVisible: baseVisible && sc.isVisible,
        opacity: baseOpacity * (sc.opacity ?? 1),
      };
    };

    canvas.getObjects().forEach((obj: any) => {
      let isVisible = true;
      let targetOpacity = obj.originalOpacity ?? obj.opacity ?? 1;
      const isOwn = obj.authorName === userName;

      if (mode === "edit") {
        if (obj.isBackground || obj.isBackgroundDrawing) {
          if (obj.isBackground) targetOpacity = bgOpacity;
        } else {
          isVisible = false;
        }
      } else if (obj.isBackground || obj.isBackgroundDrawing) {
        if (obj.isBackground) targetOpacity = bgOpacity;
      } else {
        let skipStepLayer = false;

        if (obj.authorRole === "student" && obj.authorName) {
          const vis = roomState.studentVisibilities[obj.authorName];
          const rawMode = (vis?.mode ?? "all") as string;
          const visMode = (rawMode === "teacher" ? "host" : rawMode) as "all" | "host" | "hidden";

          if (!isOwn) {
            if (role === "host") {
              if (visMode === "hidden") isVisible = false;
              if (vis?.peekAll && visMode === "host") {
                skipStepLayer = true;
                targetOpacity = (obj.originalOpacity ?? 1) * (vis.opacity ?? 1);
              } else if (visMode === "all" && isVisible) {
                const lens = peerLens[obj.authorName] ?? defaultPeerLensEntry();
                if (!lens.visible) isVisible = false;
                if (
                  isVisible &&
                  lens.steps !== "all" &&
                  obj.stepId &&
                  !lens.steps.includes(obj.stepId)
                ) {
                  isVisible = false;
                }
              }
            } else if (visMode !== "all") {
              isVisible = false;
            } else {
              const lens = peerLens[obj.authorName] ?? defaultPeerLensEntry();
              if (!lens.visible) isVisible = false;
              if (
                isVisible &&
                lens.steps !== "all" &&
                obj.stepId &&
                !lens.steps.includes(obj.stepId)
              ) {
                isVisible = false;
              }
            }
          }

          if (isVisible && !skipStepLayer && !(isOwn && role === "host")) {
            if (!(role === "host" && vis?.peekAll && visMode === "host")) {
              targetOpacity *= vis?.opacity ?? 1;
            }
          }
        }

        if (!skipStepLayer && obj.stepId && obj.authorName) {
          const page = pagesRef.current[currentPageIndexRef.current];
          const list =
            obj.authorName === userName
              ? steps
              : getParticipantBundle(
                  page,
                  obj.authorName,
                  obj.authorRole === "host" ? obj.authorName : undefined
                ).steps;
          ({ isVisible, opacity: targetOpacity } = applyStepLayer(
            obj,
            list,
            isVisible,
            targetOpacity
          ));
        }
      }

      obj.set({ visible: isVisible, opacity: targetOpacity });
    });
    canvas.requestRenderAll();
  }, [
    canvas,
    roomState,
    steps,
    pages,
    peerLens,
    role,
    userName,
    mode,
    bgOpacity,
    renderTick,
  ]);

  // 📄 페이지 로드(changePage)가 끝나면 렌더 엔진을 한 번 더 돌려서
  //    배경 투명도/단계/학생 통제값을 새 페이지 객체들에도 확실히 적용 (전역 배경 투명도 유지)
  useEffect(() => {
    if (!canvas) return;
    const onReloaded = () => {
      setRenderTick((t) => t + 1);
      extractStudents(canvas);
      requestAnimationFrame(() => {
        const o =
          (pagesRef.current[currentPageIndexRef.current]?.background?.orientation as PageOrientation) ||
          defaultPageOrientationRef.current;
        fitCanvasToView(canvas, o);
      });
    };
    // canvas:reloaded 는 usePagination 이 직접 fire 하는 커스텀 이벤트라 타입 우회 필요
    (canvas as any).on("canvas:reloaded", onReloaded);
    return () => { (canvas as any).off("canvas:reloaded", onReloaded); };
  }, [canvas]);

  // 🟢 배경 투명도 변경을 학생에게 실시간 동기화 (방장만 송신)
  useEffect(() => {
    if (role !== "host" || !channel) return;
    channel.send({ type: "broadcast", event: "sync-bg", payload: { bgOpacity } });
  }, [bgOpacity, channel, role]);

  // 📄 페이지 구조(배경 url·개수) 변화 시 학생에게 메타 동기화 (방장만).
  //    필기 json은 제외(용량) → 학생은 이동 시 storage에서 PDF만 lazy 렌더. 그리기는 별개로 실시간 전송됨.
  const lastPagesSig = useRef("");
  useEffect(() => {
    if (role !== "host" || !channel) return;
    const meta = pages.map((p) => ({
      background: p.background
        ? {
            type: p.background.type,
            path: (p.background as any).path ?? null,
            url: p.background.url,
            pdfPageNumber: (p.background as any).pdfPageNumber,
            orientation: (p.background as any).orientation,
            opacity: p.background.opacity,
          }
        : null,
      steps: p.steps,
    }));
    const sig = JSON.stringify(meta.map((m) => m.background)); // 배경 구조만 시그니처 → 그리기(json 변화)론 재전송 안 함
    if (sig === lastPagesSig.current) return;
    lastPagesSig.current = sig;
    channel.send({ type: "broadcast", event: "sync-pages", payload: { meta } });
  }, [pages, channel, role]);

  // 1️⃣ 최초 캔버스 생성 로직
  useEffect(() => {
    if (!canvasEl.current) return;
    const newCanvas = new fabric.Canvas(canvasEl.current, { 
      isDrawingMode: false, 
      width: window.innerWidth, 
      height: window.innerHeight, 
      backgroundColor: "#000000",
      selection: false 
    });
    setCanvas(newCanvas);

    return () => { 
      newCanvas.dispose(); 
      setCanvas(null); 
    };
  }, []);

  // ✨ 2️⃣ 기기 회전(리사이즈) 시 컨텐츠가 잘리지 않고 딱 맞게 조절되는 오토핏(Auto-Fit) 엔진
  useEffect(() => {
    if (!canvas) return;

    // 리사이즈/회전 시에도 페이지 로드와 동일한 프레임 기준으로 맞춤 (기준 통일)
    const handleResize = () => {
      const o =
        (pagesRef.current[currentPageIndexRef.current]?.background?.orientation as PageOrientation) ||
        defaultPageOrientationRef.current;
      fitCanvasToView(canvas, o);
    };

    // 브라우저/기기 리사이즈 + 모바일 회전 이벤트 등록
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    const handleSelection = () => setHasSelection(canvas.getActiveObjects().length > 0);
    canvas.on("selection:created", handleSelection); canvas.on("selection:updated", handleSelection); canvas.on("selection:cleared", handleSelection);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((canvas.getActiveObject() as any)?.isEditing || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedObjects();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { canvas.off("selection:created", handleSelection); canvas.off("selection:updated", handleSelection); canvas.off("selection:cleared", handleSelection); window.removeEventListener("keydown", handleKeyDown); };
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    
    const handleObjectAdded = (e: any) => {
      const obj = e.target;
      
      // 내가 방금 추가한 객체(남이 보낸 게 아님)일 때만 작동
      if (obj && !obj.isRemote && !obj.isBackground) {

        // 0. 고유 id 부여 (없으면) — 동기화/지우기/재생의 기준 키
        if (!obj.id) obj.set({ id: genId() });
        
        // 1. 기존 속성 세팅
        if (obj.isBackgroundDrawing === undefined) {
          const isBgMode = mode === "edit" && !(obj as any).isCapture;
          obj.set({
            isBackgroundDrawing: isBgMode,
            stepId: isBgMode ? undefined : activeStepId,
            authorName: userName,
            authorRole: role,
            originalOpacity: obj.originalOpacity ?? obj.opacity ?? 1,
          });
        } else if (obj.originalOpacity === undefined) {
          obj.set({ originalOpacity: obj.opacity ?? 1 });
        }

        if (obj.isBackground || obj.isBackgroundDrawing) {
          if (obj.isBackground) obj.set({ opacity: bgOpacity });
        }

        // 🚀 broadcast 는 '완료 시점'(path:created · 텍스트 편집종료) 핸들러에서 한 번만 처리

        // 💾 DB 저장도 완료 시점(finalize) 핸들러에서 처리
      }
    };
    
    canvas.on("object:added", handleObjectAdded);
    return () => { canvas.off("object:added", handleObjectAdded); };
  }, [canvas, mode, activeStepId, bgOpacity, userName, role]);

  // 🏁 '완료' 시점에만 한 번 broadcast + 이벤트 기록
  //    (펜/도형/직선 = path:created, 텍스트 = 편집종료, 캡처 = useCapture에서 직접 fire)
  useEffect(() => {
    if (!canvas) return;
    const onFinalize = (e: any) => {
      const obj = e.path ?? e.target;
      if (!obj || obj.isRemote || obj.isBackground) return;
      if (!obj.id) obj.set({ id: genId() });
      const data = obj.toObject(SERIALIZE_PROPS); // ⚠️ toJSON 은 속성목록을 무시함 → toObject 로 커스텀 태그(authorRole 등) 포함
      // 1) 실시간 전송 (channel state 가 아니라 ref 로 최신/유효 채널 보장)
      if (channelRef.current) channelRef.current.send({ type: "broadcast", event: "draw", payload: data });
      // 2) 영구 기록 (방장만, 용량 여유 있을 때) + 스냅샷 갱신
      if (role === "host") {
        if (!storageFullRef.current) {
          appendEvents(roomId, [{ page_index: currentPageIndexRef.current, type: "add", payload: data, author_name: userName, author_role: role }]);
        }
        updateCurrentPageJson();
      }
    };
    canvas.on("path:created", onFinalize);
    (canvas as any).on("text:editing:exited", onFinalize);
    return () => {
      canvas.off("path:created", onFinalize);
      (canvas as any).off("text:editing:exited", onFinalize);
    };
  }, [canvas, role, roomId, userName]);

  useEffect(() => {
    if (!canvas) return;

    if (activeTool === "select") {
      canvas.selection = true;
      canvas.defaultCursor = "default";
      canvas.centeredKey = null;

      canvas.getObjects().forEach((obj: any) => {
        if (mode === "edit") {
           if (obj.isBackground || obj.isBackgroundDrawing) {
              obj.set({ selectable: true, evented: true, hasControls: true });
           } else {
              obj.set({ selectable: false, evented: false, hasControls: false });
           }
        } else {
           const editStepId = activeStepId;
           if (obj.type === "path" && !obj.isBackground && !obj.isBackgroundDrawing && obj.stepId === editStepId) {
              obj.set({ selectable: true, evented: true, hasControls: true });
           } else {
              obj.set({ selectable: false, evented: false, hasControls: false });
           }
        }
      });
    } else {
      canvas.selection = false;
      canvas.getObjects().forEach((obj: any) => {
         obj.set({ selectable: false, evented: false, hasControls: false });
      });
      canvas.discardActiveObject();
    }

    if (activeTool === "text") {
      canvas.defaultCursor = "text";
      const handleCanvasClick = (options: any) => {
        if (options.target) return;
        const pointer = options.scenePoint;
        if (!pointer) return;
        if (!allowDrawAtRef.current(pointer.x, pointer.y)) return;

        const text = new fabric.IText("텍스트 입력", {
          left: pointer.x, top: pointer.y,
          fontFamily: "Arial", fill: currentConfig.color, fontSize: 32,
          stepId: activeStepId,
        });
        
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll(); 
        setActiveTool("select"); 
      };
      
      canvas.on("mouse:down", handleCanvasClick);
      return () => { canvas.off("mouse:down", handleCanvasClick); };
    }

    canvas.requestRenderAll();
  }, [canvas, activeTool, mode, currentConfig.color, activeStepId]);

  const updateConfig = (updates: any) => {
    if (["pen", "shape", "text"].includes(activeTool)) setPenConfig((prev) => ({ ...prev, ...updates }));
    else if (activeTool === "highlighter") setHighlighterConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleToolClick = (tool: any) => {
    if (activeTool === tool && ["pen", "highlighter", "shape"].includes(tool)) { setPopoverOpen(popoverOpen === tool ? null : tool); setShowColorPicker(false); }
    else { setActiveTool(tool); setPopoverOpen(tool === "shape" ? "shape" : null); }
  };

  const deleteSelectedObjects = React.useCallback(() => {
    if (!canvas) return;
    const _delObjs = canvas.getActiveObjects();
    const _delIds = _delObjs.map((o: any) => o.id).filter(Boolean);
    _delObjs.forEach((obj) => canvas.remove(obj));
    if (channelRef.current && _delIds.length) channelRef.current.send({ type: "broadcast", event: "erase", payload: { ids: _delIds } });
    if (role === "host" && _delIds.length && !storageFullRef.current) {
      appendEvents(roomId, [{ page_index: currentPageIndexRef.current, type: "erase", payload: { ids: _delIds }, author_name: userName, author_role: role }]);
    }
    canvas.discardActiveObject(); canvas.requestRenderAll(); setHasSelection(false); 
    updateCurrentPageJson();
  }, [canvas]);

  // ✨ 배경 편집 모드에서 '단일 이미지 객체'를 90도씩 회전하는 기본 기능(살려둠)
  const handleRotateImage = () => {
    if (selectedImage && canvas) { selectedImage.set({ angle: (selectedImage.angle || 0) + 90 }); canvas.requestRenderAll(); }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canUseBackgroundEdit) {
      e.target.value = "";
      return;
    }
    if (storageFullRef.current) {
      alert("저장 용량이 가득 찼습니다. 요금제를 업그레이드한 뒤 다시 시도해 주세요.");
      e.target.value = '';
      return;
    }
    if (file.type === "application/pdf") setPdfFilePending(file); else handleFileUpload(file, "portrait");
    e.target.value = '';
  };

  const updateCurrentPageJson = () => {
    if (role !== "host" || !canvas) return;
    
    // 캔버스 전체를 뽑되, 배경 이미지(isBackground)는 json에 넣지 않는다.
    //  → 배경은 background 메타(type/url/pdfPageNumber)로만 저장하고 로드 때 prepareBackgroundImage로 재생성.
    //    (배경 dataURL을 json에 넣으면 canvas_json이 수 MB로 폭증 → 저장 실패/용량초과 → 지각생 빈 화면)
    //  changePage의 저장 형식과 동일하게: json=필기(전경), background.drawingsJson=배경 위 필기.
    const fullJson: any = canvas.toObject(["id", "stepId", "originalOpacity", "selectable", "evented", "authorName", "authorRole", "isBackground", "isBackgroundDrawing", "isCapture"]);
    const bgDrawings = fullJson.objects.filter((o: any) => o.isBackgroundDrawing);
    const fgDrawings = fullJson.objects.filter(
      (o: any) => !o.isBackgroundDrawing && !o.isBackground && !o.isPageFrame
    );

    setPages((prevPages) => {
      const nextPages = [...prevPages];
      const cur = nextPages[currentPageIndexRef.current];
      if (cur) {
        nextPages[currentPageIndexRef.current] = {
          ...cur,
          json: { ...fullJson, objects: fgDrawings },
          background: { ...(cur.background || { type: "none", url: null, opacity: 1 }), drawingsJson: { ...fullJson, objects: bgDrawings } },
        };
      }
      return nextPages;
    });
  };

  // 🟢 2. pages 상태가 변할 때마다 DB에 백업 (과부하 방지를 위해 1초 딜레이 적용)
  useEffect(() => {
    if (role === "host" && pages.length > 0 && hasJoined.current) {
      const saveTimer = setTimeout(async () => {
        const ok = await canStore();
        setStorageFull(!ok);
        if (ok) {
          saveRoomPages(roomId, pages).catch(console.error);
          console.log("💾 DB 자동 저장 완료!");
        } else {
          console.warn("⛔ 저장 용량 초과 — 자동 저장 중단 (업그레이드 필요)");
        }
      }, 1000);
      return () => clearTimeout(saveTimer);
    }
  }, [pages, roomId, role]);

  useEffect(() => {
    if (role !== "host") return;

    const forceSave = () => {
      // 페이지에 데이터가 하나라도 있다면
      if (pagesRef.current && pagesRef.current.length > 0) {
        // 브라우저가 닫히는 찰나이므로, 결과를 기다릴(await) 여유 없이 바로 DB로 쏴버립니다.
        saveRoomPages(roomId, pagesRef.current).catch((err) => {
          console.error("안전망 저장 실패:", err);
        });
      }
    };

    // 1. 브라우저 새로고침(F5) 이나 탭 닫기를 눌렀을 때 발동
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      forceSave();
    };

    // 2. 다른 탭으로 이동하거나 브라우저를 최소화했을 때 발동 (모바일 환경에서 특히 유용)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        forceSave();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomId, role]);

  useEffect(() => {
    // 🚨 [핵심 수정] 초기 로딩이 "완벽하게 끝난(isInitialLoadComplete)" 이후에만 저장 허용!
    if (role === "host" && isInitialLoadComplete) {
      const stateToSave = { ...roomState, currentPageIndex, bgOpacity };
      localStorage.setItem(`room_${roomId}_state`, JSON.stringify(stateToSave));
    }
  }, [roomState, currentPageIndex, role, roomId, isInitialLoadComplete, bgOpacity]);

  // 🚀 4. [동기화 보강] 방장이 하단 바에서 페이지를 넘겼을 때, 수업 모드라면 학생 화면도 넘김!
  const prevPageRef = useRef(currentPageIndex);
  useEffect(() => {
    if (role === "host" && prevPageRef.current !== currentPageIndex) {
      prevPageRef.current = currentPageIndex;
      // 📖 페이지 이동 이벤트 기록 (재생용)
      if (!storageFullRef.current) {
        appendEvents(roomId, [{ page_index: currentPageIndex, type: "page", payload: { index: currentPageIndex }, author_name: userName, author_role: role }]);
      }
      // 방장이 페이지를 넘겼는데 '수업 모드(학생 화면 고정)'가 켜져 있다면?
      if (roomState.isClassMode && channel) {
        const newState = { ...roomState, currentPageIndex };
        setRoomState(newState);
        // 학생들에게 "나 3페이지로 갔으니 너희도 당장 3페이지로 따라와!" 라고 방송
        channel.send({
          type: "broadcast",
          event: "update-room-state",
          payload: newState
        });
      }
    }
  }, [currentPageIndex, role, roomState, channel, roomId, userName]);

  const peerNames = useMemo(() => {
    return activeStudents.filter((name) => {
      if (name === userName) return false;
      if (role === "host") return true;
      const m = roomState.studentVisibilities[name]?.mode ?? "all";
      return m === "all";
    });
  }, [role, activeStudents, userName, roomState.studentVisibilities]);

  const stepIdsByAuthor = useMemo(() => {
    if (!canvas) return {} as Record<string, string[]>;
    const objs = canvas.getObjects().map((o) => o as any);
    const rec: Record<string, string[]> = {};
    for (const n of peerNames) rec[n] = collectAuthorStepIds(objs, n);
    return rec;
  }, [canvas, peerNames, renderTick]);

  const stepLabelByAuthor = useMemo(() => {
    const page = pages[currentPageIndex];
    const rec: Record<string, Record<string, string>> = {};
    for (const n of peerNames) {
      const bundle = getParticipantBundle(page, n, undefined);
      rec[n] = Object.fromEntries(bundle.steps.map((s) => [s.id, s.name]));
    }
    return rec;
  }, [pages, currentPageIndex, peerNames]);

  // 🚪 정원 초과로 막힌 학생 화면
  if (roomFull) {
    return (
      <div className="flex h-screen w-full items-center justify-center px-4 font-sans text-gray-900 selection:bg-leaf-100">
        <div className="gg-glass p-10 text-center max-w-md w-full">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">방이 가득 찼어요</h2>
          <p className="text-gray-500 mb-8 font-medium leading-relaxed">
            이 수업의 정원({maxStudents}명)이 모두 찼습니다.<br />방장께 문의해 주세요.
          </p>
          <button onClick={() => router.push('/')} className="gg-btn gg-btn--ghost gg-btn--block">
            메인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={boardFocusRef}
      tabIndex={-1}
      className="w-full h-dvh overflow-hidden touch-none bg-gray-50 relative outline-none"
      onPointerEnter={() => setIsHoveringCanvas(true)}
      onPointerLeave={() => setIsHoveringCanvas(false)}
      onPointerDown={() => boardFocusRef.current?.focus({ preventScroll: true })}
      style={{ cursor: activeTool === "eraser" || eraseGestureOn ? "none" : "auto" }}
      >
      {/* 🎯 2. 로딩창 바로 위에(또는 아래에) 지우개 히트박스(빨간 원) UI를 추가합니다. */}
      {((activeTool === "eraser" && isHoveringCanvas) || eraseGestureOn) && (
        <div
          className="fixed pointer-events-none z-[99] rounded-full border-2 border-red-400 bg-red-400/20 backdrop-blur-[1px] transition-transform duration-75"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            width: "40px",  /* 지우개 크기 */
            height: "40px",
            transform: "translate(-50%, -50%)", /* 커서 중앙 정렬 */
          }}
        />
      )}
      {isLoading && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in">
          <Loader2 size={48} className="text-leaf-600 animate-spin mb-4" />
          <h2 className="text-xl font-bold text-gray-800">교재를 분석하고 도화지로 만드는 중...</h2>
        </div>
      )}
      
      {/* ✨ 찌꺼기 컨테이너 제거 완료 - 깔끔한 순정 상태 */}
      <div className="absolute inset-0 z-0">
        <canvas ref={canvasEl} />
      </div>

      {/* 좌측 스택(모드/방코드/나가기/회전): uiHidden이면 숨김 (👁 버튼으로 토글) */}
      {!uiHidden && (
      <>
      <div className="absolute top-6 left-6 flex flex-col gap-2 w-[260px] z-30">
        {role === "host" && (
          <div className="gg-glass p-2 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">방장 통제</span>
            <button
              type="button"
              onClick={() => {
                setHostControlMode((on) => {
                  if (on) setMode("class");
                  return !on;
                });
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${hostControlMode ? "bg-leaf-600 text-white" : "bg-gray-100 text-gray-500"}`}
            >
              {hostControlMode ? "ON" : "OFF"}
            </button>
          </div>
        )}
        <div className="flex w-full gg-glass p-1.5">
          {canUseBackgroundEdit ? (
            <>
              <button onClick={() => setMode("edit")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all ${mode === "edit" ? "bg-orange-100 text-orange-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}><Settings size={18} /> 배경 편집</button>
              <button onClick={() => setMode("class")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all ${mode === "class" ? "bg-leaf-100 text-leaf-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}><BookOpen size={18} /> 수업 모드</button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold bg-leaf-100 text-leaf-600">
              <BookOpen size={18} /> 수업 모드
            </div>
          )}
        </div>
      </div>

      {/* 2. 초대 코드 박스 (너비 260px, 간격 조정) */}
      <div 
        onClick={handleCopyRoomId}
        className={`absolute left-6 flex items-start justify-between w-[260px] gg-glass p-3 px-4 z-30 cursor-pointer hover:border-leaf-300 transition-all group ${role === "host" ? "top-[130px]" : "top-[84px]"}`}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold text-gray-400 mb-0.5 tracking-tight">INVITE CODE</span>
          <span className="text-xl font-extrabold text-gray-800 tracking-[0.2em]">{roomId}</span>
          {role === "host" && (
            <>
              <span className="text-[10px] font-bold text-gray-400 mt-2.5 mb-1 tracking-tight">입장 암호</span>
              <button
                type="button"
                onClick={handleReregisterPassphrase}
                className="self-start text-xs font-bold text-leaf-600 hover:text-leaf-700 bg-leaf-50 hover:bg-leaf-100 border border-leaf-200 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                암호 재등록
              </button>
            </>
          )}
        </div>
        <div className={`p-2 rounded-xl transition-all duration-300 shrink-0 ${showCopyToast ? 'bg-green-100 text-green-600 scale-110' : 'bg-gray-50 text-gray-400 group-hover:bg-leaf-100 group-hover:text-leaf-600'}`}>
          {showCopyToast ? <Check size={18} strokeWidth={3} /> : <Copy size={18} strokeWidth={2.5} />}
        </div>
      </div>

      {/* 3. 방 나가기 버튼 (너비 260px, 빨간색 강조) */}
      <button
        onClick={handleExit}
        className={`absolute left-6 flex items-center justify-center gap-2 w-[260px] py-3.5 gg-glass text-sm font-bold text-red-500 border border-red-100 hover:bg-red-50 hover:border-red-300 transition-all z-30 group ${role === "host" ? "top-[252px]" : "top-[162px]"}`}
      >
        <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span>수업 종료 및 나가기</span>
      </button>

      {/* 4. 배경 90도 회전하기 (너비 260px, 아래로 쑥 내림) */}
      {canUseBackgroundEdit && mode === "edit" && selectedImage && (
        <div className={`absolute left-6 w-[260px] gg-glass p-3 border border-orange-200 z-30 animate-in fade-in zoom-in-95 duration-200 ${role === "host" ? "top-[320px]" : "top-[230px]"}`}>
          <button onClick={handleRotateImage} className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl font-bold text-sm transition-colors active:scale-95"><RotateCw size={18} /> 배경 90도 회전하기</button>
        </div>
      )}
      </>
      )}

      {/* 5. 복사 완료 토스트 알림 (화면 상단 중앙) */}
      {showCopyToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-5 py-3 bg-gray-800/95 backdrop-blur-sm text-white font-bold text-sm rounded-full shadow-2xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <Check size={18} className="text-green-400" />
          초대 코드가 복사되었습니다!
        </div>
      )}

      {storageFull && role === "host" && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 bg-red-600 text-white font-bold text-sm rounded-xl shadow-2xl z-50 max-w-md text-center">
          저장 용량을 초과했습니다. 실시간 수업은 계속되지만 새 필기는 저장되지 않습니다. 요금제를 업그레이드해 주세요.
        </div>
      )}


      {/* ✨ FloatingToolbar에 넘겼던 쓰레기 props 깔끔하게 제거 완료 */}
      <FloatingToolbar 
        activeTool={activeTool} handleToolClick={handleToolClick} hasSelection={hasSelection} deleteSelectedObjects={deleteSelectedObjects}
        mode={mode} popoverOpen={popoverOpen} selectedShape={selectedShape} setSelectedShape={setSelectedShape}
        penConfig={penConfig} currentConfig={currentConfig} updateConfig={updateConfig}
        showColorPicker={showColorPicker} setShowColorPicker={setShowColorPicker}
      />

      {/* 👁 좌하단: 패널 숨기기/보기 토글 (항상 표시) */}
      <button
        onClick={() => setUiHidden((v) => !v)}
        className="absolute bottom-8 left-8 z-30 w-11 h-11 flex items-center justify-center gg-glass rounded-full text-gray-500 hover:text-leaf-700 transition-all active:scale-95"
        title={uiHidden ? "패널 보이기" : "패널 숨기기"}
      >
        {uiHidden ? <Eye size={20} /> : <EyeOff size={20} />}
      </button>

      {!uiHidden && (mode === "class" || (role === "host" && hostControlMode)) && (
        <div className="absolute top-6 right-6 z-20 w-80 max-h-[calc(100dvh-5rem)] overflow-y-auto flex flex-col gap-3 origin-top-right scale-[0.7] sm:scale-100">
          {role === "host" && hostControlMode && (
            <HostControlPanel
              mode={mode}
              roomState={roomState}
              updateRoomState={updateRoomState}
              currentPageIndex={currentPageIndex}
              pages={pages}
              setPages={setPages}
              activeStudents={activeStudents}
              roster={roster}
              emitSyncPages={(newPages) => saveRoomPages(roomId, newPages).catch(console.error)}
              bgOpacity={bgOpacity}
              setBgOpacity={setBgOpacity}
            />
          )}
          {mode === "class" && (
            <StepLayerPanel
              title={role === "host" && hostControlMode ? "풀이 단계" : "내 단계"}
              steps={steps}
              activeStepId={activeStepId}
              onSelectStep={(id, nextSteps) => emitParticipantSteps(nextSteps, id)}
              onAddStep={() => {
                const newId = `step-${steps.length + 1}`;
                const nextSteps = [
                  ...steps.map((s) => (s.id === activeStepId ? { ...s, opacity: 0.2 } : s)),
                  { id: newId, name: `Step ${steps.length + 1}`, isVisible: true, opacity: 1 },
                ];
                emitParticipantSteps(nextSteps, newId);
              }}
              onToggleVisible={(_id, nextSteps) => {
                emitParticipantSteps(nextSteps, activeStepId);
              }}
              onOpacityChange={(_id, _opacity, nextSteps) => {
                emitParticipantSteps(nextSteps, activeStepId);
              }}
            />
          )}
        </div>
      )}

      {mode === "class" && !uiHidden && (
        <PeerViewPanel
          peerNames={peerNames}
          stepLabelByAuthor={stepLabelByAuthor}
          stepIdsByAuthor={stepIdsByAuthor}
          lens={peerLens}
          setLens={setPeerLens}
        />
      )}

      <BottomBar
        currentPageIndex={currentPageIndex} totalPages={pages.length} prevPage={prevPage} nextPage={nextPage} deletePage={deletePage}
        mode={mode} canUseBackgroundEdit={canUseBackgroundEdit}
        fileInputRef={fileInputRef} pdfFilePending={pdfFilePending} setPdfFilePending={setPdfFilePending} handleFileUpload={handleFileUpload}
      />

      <input type="file" ref={fileInputRef} onChange={onFileChange} accept="image/*,application/pdf" className="hidden" />
    </div>
  );
};

export default Whiteboard;