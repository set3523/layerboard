// src/hooks/useSteps.ts
import { useState } from "react";

export interface Step {
  id: string;
  name: string;
  isVisible: boolean;
  opacity?: number; // ✨ 투명도 속성 추가!
}

/** 현재 사용자 step UI (페이지 participantSteps 와 연동) */
export const useSteps = () => {
  const [steps, setSteps] = useState<Step[]>([
    { id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }, // 초기값에 opacity: 1 추가
  ]);
  const [activeStepId, setActiveStepId] = useState<string>("step-1");

  /* 🚨 기존에 있던 applyGhostMode 삭제 🚨
    이유: 이제 Whiteboard.tsx의 [마법의 렌더링 엔진]이 
    방장 통제에 따라 중앙에서 모든 투명도를 관리하므로, 여기서 캔버스를 건드리면 꼬입니다!
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