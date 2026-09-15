// src/hooks/useSteps.ts
import { useState, useEffect, useRef } from "react";
import * as fabric from "fabric";

export interface Step {
  id: string;
  name: string;
  isVisible: boolean;
  opacity?: number; // ✨ 투명도 속성 추가!
}

export const useSteps = (canvas: fabric.Canvas | null) => {
  const [steps, setSteps] = useState<Step[]>([
    { id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }, // 초기값에 opacity: 1 추가
  ]);
  const [activeStepId, setActiveStepId] = useState<string>("step-1");

  const activeStepIdRef = useRef(activeStepId);
  useEffect(() => {
    activeStepIdRef.current = activeStepId;
  }, [activeStepId]);

  // 꼬리표 달아주는 로직은 그대로 유지
  useEffect(() => {
    if (!canvas) return;

    const handlePathCreated = (e: any) => {
      const path = e.path;
      if (path) {
        path.set({
          stepId: activeStepIdRef.current,
          originalOpacity: path.opacity || 1.0, 
        });
      }
    };

    canvas.on("path:created", handlePathCreated);
    return () => { canvas.off("path:created", handlePathCreated); };
  }, [canvas]);

  /* 🚨 기존에 있던 applyGhostMode 삭제 🚨
    이유: 이제 Whiteboard.tsx의 [마법의 렌더링 엔진]이 
    선생님의 통제에 따라 중앙에서 모든 투명도를 관리하므로, 여기서 캔버스를 건드리면 꼬입니다!
  */

  const addStep = () => {
    const newId = `step-${steps.length + 1}`;
    setSteps((prev) => [...prev, { id: newId, name: `Step ${steps.length + 1}`, isVisible: true, opacity: 1 }]);
    setActiveStepId(newId);
  };

  const toggleStepVisibility = (id: string) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, isVisible: !step.isVisible } : step)));
  };

  // ✨ 슬라이더를 움직일 때 단계별 투명도를 조절하는 새로운 함수!
  const updateStepOpacity = (id: string, opacity: number) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, opacity } : step)));
  };

  return { steps, setSteps, activeStepId, setActiveStepId, addStep, toggleStepVisibility, updateStepOpacity };
};