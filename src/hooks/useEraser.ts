import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import { isFingerTouch } from "../lib/pointerInput";

// 🔴 공용 지우기 로직.
// 씬 좌표(pointer)에 닿은 '지울 수 있는' 객체를 모두 제거하고, 지운 id 배열을 돌려준다.
//  - 배경 편집 모드: 배경 위 필기(isBackgroundDrawing)만 지움. PDF/이미지 자체(isBackground)는 보호.
//  - 수업 모드: 현재 step 필기만 지움. 배경/배경필기/다른 step 은 보호.
// (툴 지우개 · 우클릭/펜버튼 지우개가 이 함수를 함께 쓴다 → 동작이 항상 동일)
export function eraseAtScenePoint(
  canvas: fabric.Canvas,
  pointer: { x: number; y: number },
  activeStepId: string,
  isBgMode: boolean,
  userName: string
): string[] {
  const objects = canvas.getObjects();
  const erasedIds: string[] = [];

  // 맨 위(최근에 그린)부터 훑되, 포인터에 닿은 대상은 한 번에 모두 제거 (겹친 획도 한 번에).
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i] as any;

    // ✋ 본인 필기만 지움 (authorName === userName). 남의 필기는 보호.
    const isOwn = obj.authorName === userName;
    const erasable = isOwn && (isBgMode
      ? obj.isBackgroundDrawing === true
      : (!obj.isBackground && !obj.isBackgroundDrawing && obj.stepId === activeStepId));

    if (erasable && obj.containsPoint(pointer as any)) {
      if (obj.id) erasedIds.push(obj.id);
      canvas.remove(obj);
    }
  }

  if (erasedIds.length > 0) canvas.requestRenderAll();
  return erasedIds;
}

export const useEraser = (
  canvas: fabric.Canvas | null,
  isActive: boolean,
  activeStepId: string,
  isBgMode: boolean,
  userName: string,
  onErase?: (ids: string[]) => void
) => {
  const isErasing = useRef(false);

  useEffect(() => {
    // 캔버스가 없거나 지우개 툴이 아니면 이벤트 종료
    if (!canvas || !isActive) return;

    // 그리기 모드 해제 및 십자선 커서 적용
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";

    const eraseStroke = (options: fabric.TPointerEventInfo) => {
      const pointer = options.scenePoint;
      if (!pointer) return;
      const ids = eraseAtScenePoint(canvas, pointer, activeStepId, isBgMode, userName);
      if (ids.length > 0 && onErase) onErase(ids); // 겹친 것까지 한 번에 동기화 + 이벤트 로그
    };

    const handleMouseDown = (options: fabric.TPointerEventInfo) => {
      if (isFingerTouch(options.e)) return; // 손가락은 페이지 넘김용 → 지우기 X
      isErasing.current = true;
      eraseStroke(options);
    };

    const handleMouseMove = (options: fabric.TPointerEventInfo) => {
      if (isErasing.current) {
        eraseStroke(options);
      }
    };

    const handleMouseUp = () => {
      isErasing.current = false;
    };

    // 이벤트 등록
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      // 클린업
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
      canvas.defaultCursor = "default";
    };
  }, [canvas, isActive, activeStepId, isBgMode, userName, onErase]);
};
