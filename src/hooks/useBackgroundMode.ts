import { useState, useEffect } from "react";
import * as fabric from "fabric";

export type BoardMode = "edit" | "class";

export const useBackgroundMode = (canvas: fabric.Canvas | null) => {
  const [mode, setMode] = useState<BoardMode>("class");
  const [selectedImage, setSelectedImage] = useState<fabric.Image | null>(null);

  useEffect(() => {
    if (!canvas) return;

    // 모드 변경 시 객체 상태 업데이트
    const updateObjects = () => {
      canvas.getObjects().forEach((obj) => {
        // 이미지(교재) 객체인 경우
        if (obj instanceof fabric.Image) {
          if (mode === "edit") {
            // 배경 편집 모드: 선택 및 이동 가능
            obj.set({
              selectable: true,
              evented: true,
              hasControls: true,
              lockMovementX: false,
              lockMovementY: false,
              hoverCursor: "move",
            });
          } else {
            // 수업 모드: 완벽 잠금
            obj.set({
              selectable: false,
              evented: false,
              hasControls: false,
              lockMovementX: true,
              lockMovementY: true,
              hoverCursor: "default",
            });
          }
        }
      });
      canvas.discardActiveObject(); // 선택 해제
      canvas.requestRenderAll();
    };

    updateObjects();

    // 이미지 선택 이벤트 감지 (편집 모드에서 투명도 조절용)
    const handleSelection = () => {
      const activeObj = canvas.getActiveObject();
      if (activeObj instanceof fabric.Image && mode === "edit") {
        setSelectedImage(activeObj);
      } else {
        setSelectedImage(null);
      }
    };

    canvas.on("selection:created", handleSelection);
    canvas.on("selection:updated", handleSelection);
    canvas.on("selection:cleared", handleSelection);

    return () => {
      canvas.off("selection:created", handleSelection);
      canvas.off("selection:updated", handleSelection);
      canvas.off("selection:cleared", handleSelection);
    };
  }, [canvas, mode]);

  // 이미지 투명도 조절 함수
  const updateOpacity = (val: number) => {
    if (selectedImage && canvas) {
      selectedImage.set("opacity", val);
      canvas.requestRenderAll();
    }
  };

  return { mode, setMode, selectedImage, updateOpacity };
};