import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import { isDrawInput } from "../lib/pointerInput";

// ✨ "line"(직선) 타입이 새로 추가되었습니다!
export type ShapeType = "rect" | "circle" | "triangle" | "line";

export const useShape = (
  canvas: fabric.Canvas | null,
  isActive: boolean,
  shapeType: ShapeType,
  color: string,
  strokeWidth: number,
  onComplete: () => void
) => {
  const isDrawing = useRef(false);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const currentShape = useRef<fabric.Object | null>(null);

  useEffect(() => {
    if (!canvas || !isActive) {
      if (canvas) canvas.defaultCursor = "default";
      return;
    }

    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";

    const handleMouseDown = (o: fabric.TPointerEventInfo) => {
      if (!isDrawInput(o.e)) return;
      const pointer = o.scenePoint;
      if (!pointer) return;

      isDrawing.current = true;
      startPoint.current = pointer;

      const commonProps = {
        left: pointer.x,
        top: pointer.y,
        fill: "transparent",
        stroke: color,
        strokeWidth: strokeWidth,
        originX: "left" as const, // ✨ 클릭 지점 완벽 고정!
        originY: "top" as const,
        selectable: false,
        evented: false,
        strokeUniform: true, // 크기 조절해도 선 굵기 유지
      };

      if (shapeType === "rect") {
        currentShape.current = new fabric.Rect({ ...commonProps, width: 0, height: 0 });
      } else if (shapeType === "circle") {
        currentShape.current = new fabric.Circle({ ...commonProps, radius: 0 });
      } else if (shapeType === "triangle") {
        currentShape.current = new fabric.Triangle({ ...commonProps, width: 0, height: 0 });
      } else if (shapeType === "line") {
        // 직선 전용 객체 생성
        currentShape.current = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color,
          strokeWidth: strokeWidth,
          selectable: false,
          evented: false,
        });
      }

      if (currentShape.current) {
        canvas.add(currentShape.current);
      }
    };

    const handleMouseMove = (o: fabric.TPointerEventInfo) => {
      if (!isDrawing.current || !currentShape.current || !startPoint.current) return;
      const pointer = o.scenePoint;
      if (!pointer) return;

      const start = startPoint.current;

      if (shapeType === "line") {
        // 직선은 마우스 포인터의 끝점(x2, y2)만 변경해주면 됨
        (currentShape.current as fabric.Line).set({ x2: pointer.x, y2: pointer.y });
      } else {
        const w = Math.abs(pointer.x - start.x);
        const h = Math.abs(pointer.y - start.y);
        const left = Math.min(pointer.x, start.x);
        const top = Math.min(pointer.y, start.y);

        if (shapeType === "rect" || shapeType === "triangle") {
          currentShape.current.set({ left, top, width: w, height: h });
        } else if (shapeType === "circle") {
          currentShape.current.set({ left, top, radius: Math.max(w, h) / 2 });
        }
      }

      canvas.requestRenderAll();
    };

    const handleMouseUp = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
  
        if (currentShape.current) {
          // ✨ 핵심: 마우스를 뗀 시점에 맞춰 객체의 실제 크기와 좌표를 강제로 새로고침합니다!
          currentShape.current.setCoords(); 
          const bounds = currentShape.current.getBoundingRect();
          
          // 새로고침된 실제 크기를 기준으로 10픽셀 이상 그렸는지 확인
          if (bounds.width < 10 && bounds.height < 10) {
            canvas.remove(currentShape.current);
          } else {
            // 크기가 충분하다면 유지하고 조작 권한 부여
            currentShape.current.set({ selectable: true, evented: true, hasControls: true });
            canvas.setActiveObject(currentShape.current);
            
            // 소켓 동기화를 위해 임시 발송
            canvas.fire("path:created", { path: currentShape.current } as any);
          }
        }
  
        currentShape.current = null;
        onComplete(); 
      };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [canvas, isActive, shapeType, color, strokeWidth, onComplete]);
};