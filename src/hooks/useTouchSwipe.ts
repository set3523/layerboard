import { useEffect, useRef } from "react";

// 👆 손가락 가로 스와이프로 페이지 넘기기 + 팜리젝션.
//  핵심 원칙: "펜이 닿아 있는 동안(또는 뗀 직후 잠깐)엔 손 입력을 전부 무시".
//   - S펜이 pointer(pen) + touch 를 동시에 쏘는 기기가 있어서, 단순히 type=touch만 받으면
//     펜의 touch-side가 스와이프로 오인돼 페이지가 넘어감 → 그래서 '펜 활성 중 손 무시'로 처리.
//   - 진짜 손가락(type=touch)만, 펜이 비활성일 때만 스와이프 인정. 멀티터치도 무시.
export const useTouchSwipe = (
  enabled: boolean,
  onNext: () => void,
  onPrev: () => void
) => {
  const nextRef = useRef(onNext);
  const prevRef = useRef(onPrev);
  nextRef.current = onNext;
  prevRef.current = onPrev;

  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const touchCount = useRef(0);
  const lastPenTs = useRef(0);
  const GRACE = 400; // 펜 뗀 뒤 이 시간(ms)까지는 손 무시(손바닥이 펜보다 늦게 떨어짐)

  useEffect(() => {
    if (!enabled) return;

    // 마지막 펜 이벤트가 최근(GRACE 이내)이면 펜 사용 중으로 간주 → 손 무시
    const penActive = () => Date.now() - lastPenTs.current < GRACE;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "pen") { lastPenTs.current = Date.now(); return; }
      if (e.pointerType !== "touch") return; // 마우스 등은 무시
      touchCount.current += 1;
      if (penActive() || touchCount.current > 1) { start.current = null; return; } // 펜 사용 중 or 멀티터치 → 무시
      start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    // 펜으로 그리는 동안 계속 '펜 활성' 갱신 (긴 획도 커버)
    const onMove = (e: PointerEvent) => { if (e.pointerType === "pen") lastPenTs.current = Date.now(); };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "pen") { lastPenTs.current = Date.now(); return; }
      if (e.pointerType !== "touch") return;
      touchCount.current = Math.max(0, touchCount.current - 1);
      const s = start.current;
      start.current = null;
      if (!s || penActive() || touchCount.current > 0) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = Date.now() - s.t;
      // 가로로 충분히(80px+) · 세로 흔들림 작게 · 빠르게(600ms 이내) → 스와이프
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 600) {
        if (dx < 0) nextRef.current(); // 왼쪽으로 밀기 → 다음 페이지
        else prevRef.current();        // 오른쪽으로 밀기 → 이전 페이지
      }
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerType === "pen") { lastPenTs.current = Date.now(); return; }
      if (e.pointerType === "touch") { touchCount.current = Math.max(0, touchCount.current - 1); start.current = null; }
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [enabled]);
};
