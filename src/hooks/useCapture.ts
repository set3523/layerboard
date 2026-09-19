import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import { uploadDataUrlToCloud } from "../lib/storage";
import { isDrawInput } from "../lib/pointerInput";

export const useCapture = (canvas: fabric.Canvas | null, isActive: boolean, onCaptured: () => void) => {
  const isDrawingRect = useRef(false);
  const rectRef = useRef<fabric.Rect | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // 툴이 비활성화되면 켜져 있던 파란색 박스 지우기
    if (!canvas || !isActive) {
      if (rectRef.current) {
        canvas?.remove(rectRef.current);
        rectRef.current = null;
      }
      return;
    }

    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = "crosshair"; // 캡처용 십자 커서

    const handleMouseDown = (o: fabric.TPointerEventInfo) => {
        if (!isDrawInput(o.e)) return;
        const scenePoint = o.scenePoint;
        if (!scenePoint) return;
  
        if (rectRef.current) canvas.remove(rectRef.current);
  
        isDrawingRect.current = true;
        startPoint.current = scenePoint;
  
        rectRef.current = new fabric.Rect({
          left: scenePoint.x,
          top: scenePoint.y,
          width: 0,
          height: 0,
          originX: "left", // ✨ 마우스 클릭한 곳을 무조건 좌측/상단 고정!
          originY: "top",  // ✨ (중심부터 커지는 현상 완벽 해결)
          fill: "rgba(119, 176, 52, 0.2)",
          stroke: "#77B034",
          strokeWidth: 2,
          strokeDashArray: [5, 5],
          selectable: false,
          evented: false,
        });
        canvas.add(rectRef.current);
      };

    const handleMouseMove = (o: fabric.TPointerEventInfo) => {
      if (!isDrawingRect.current || !rectRef.current || !startPoint.current) return;
      const scenePoint = o.scenePoint;
      if (!scenePoint) return;

      // 마우스 방향에 상관없이 올바른 넓이/높이 계산
      const x = Math.min(scenePoint.x, startPoint.current.x);
      const y = Math.min(scenePoint.y, startPoint.current.y);
      const w = Math.abs(scenePoint.x - startPoint.current.x);
      const h = Math.abs(scenePoint.y - startPoint.current.y);

      rectRef.current.set({ left: x, top: y, width: w, height: h });
      canvas.requestRenderAll();
    };

    const handleMouseUp = async () => {
      isDrawingRect.current = false;
      if (!rectRef.current) return;

      const rect = rectRef.current;
      const { left, top, width, height } = rect;

      // 캡처 화면에 파란 박스가 찍히지 않도록 먼저 지웁니다.
      canvas.remove(rect);
      rectRef.current = null;

      // 영역이 너무 작으면(클릭 실수) 캡처 무시
      if (width !== undefined && height !== undefined && Math.max(width, height) > 10) {
        try {
          // 화면에서 해당 영역만 이미지(Base64)로 추출 (화질을 위해 multiplier x2 적용)
          const dataUrl = canvas.toDataURL({
            left,
            top,
            width,
            height,
            format: "png",
            multiplier: 2, 
          });

          // 추출한 이미지를 새로운 Fabric 객체로 불러옵니다.
          const img = await fabric.Image.fromURL(dataUrl);

          // 살짝 우측 하단으로 어긋나게 배치하고 조금 키워줌 (팝업 효과)
          img.set({
            left: left! + 10, // 원본 위치에서 우측 하단으로 살짝(10px)만 어긋나게 배치 (복사된 걸 인지하도록)
            top: top! + 10,
            scaleX: 0.5, // 🌟 핵심: 2배로 뻥튀기된 사진을 크기만 0.5배로 줄여서 드래그한 원본 사이즈와 100% 일치시킴!
            scaleY: 0.5,
            originX: "left", // 중심축을 왼쪽 위로 정상화
            originY: "top",
            cornerColor: "#77B034",
            borderColor: "#77B034",
            cornerSize: 12,
            transparentCorners: false,
            isCapture: true,
          });

          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll();

          // ☁️ base64를 DB에 박지 않도록 Storage에 올리고 src를 URL로 교체
          try {
            const path = await uploadDataUrlToCloud(dataUrl, "captures");
            (img as any).storagePath = path;
            // 표시 src는 로컬 dataUrl 유지 (signed URL setSrc 시 canvas taint → 재캡처·배경 누락)
          } catch (upErr) {
            console.error("캡처 Storage 업로드 실패(base64로 유지):", upErr);
          }

          // 🔔 완료 이벤트 발사 → Whiteboard 가 broadcast + 이벤트 기록 처리
          canvas.fire("path:created", { path: img } as any);

          // 캡처 완료 후 바로 크기를 조절할 수 있게 '선택' 툴로 자동 전환
          onCaptured();
        } catch (error) {
          console.error("캡처 실패:", error);
        }
      }
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
      canvas.defaultCursor = "default";
    };
  }, [canvas, isActive, onCaptured]);
};