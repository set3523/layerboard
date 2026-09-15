// src/hooks/usePagination.ts (전체 덮어쓰기)
import { useState, useRef, useEffect } from "react";
import * as fabric from "fabric";
import { Step } from "./useSteps";
import { prepareBackgroundImage } from "./useBackgroundLoader";

export interface PageData {
  json: any;
  background?: {
    type: "pdf" | "image" | "none";
    url: string | null;
    pdfPageNumber?: number;
    opacity: number;
    orientation?: "portrait" | "landscape";
    drawingsJson?: any;
  };
  steps: Step[];
  activeStepId: string;
}

export const usePagination = (
  canvas: fabric.Canvas | null, steps: Step[], setSteps: React.Dispatch<React.SetStateAction<Step[]>>,
  activeStepId: string, setActiveStepId: React.Dispatch<React.SetStateAction<string>>
) => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const isNavigating = useRef(false);

  const stepsRef = useRef(steps); const activeStepIdRef = useRef(activeStepId); const pagesRef = useRef(pages);
  useEffect(() => { stepsRef.current = steps; }, [steps]); useEffect(() => { activeStepIdRef.current = activeStepId; }, [activeStepId]); useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { if (pages.length === 0) setPages([{ json: null, background: { type: "none", url: null, opacity: 1 }, steps: stepsRef.current, activeStepId: activeStepIdRef.current }]); }, [pages.length]);

  const changePage = async (newIndex: number, overridePages?: PageData[]) => {
    if (!canvas || isNavigating.current) return;
    isNavigating.current = true;

    try {
      const fullJson = canvas.toObject([
        "id", "stepId", "originalOpacity", "erasable", "selectable", "evented", "hasControls", "lockMovementX", "lockMovementY",
        "authorName", "authorRole", "isRemote", "isCapture", "isBackground", "isBackgroundDrawing"
      ]);

      const bgDrawings = fullJson.objects.filter((obj: any) => obj.isBackgroundDrawing);
      const fgDrawings = fullJson.objects.filter((obj: any) => !obj.isBackgroundDrawing && !obj.isBackground);

      let updatedPages = overridePages ? [...overridePages] : [...pagesRef.current];

      if (!overridePages && updatedPages[currentPageIndex]) {
        const currentBackground = {
          ...(updatedPages[currentPageIndex]?.background || { type: "none", url: null, opacity: 1 }),
          drawingsJson: { ...fullJson, objects: bgDrawings }
        };
        updatedPages[currentPageIndex] = {
          json: { ...fullJson, objects: fgDrawings },
          background: currentBackground,
          steps: stepsRef.current,
          activeStepId: activeStepIdRef.current
        };
      }

      let targetPage = updatedPages[newIndex];
      if (!targetPage) {
        targetPage = { json: null, background: { type: "none", url: null, opacity: 1 }, steps: [{ id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }], activeStepId: "step-1" };
        updatedPages[newIndex] = targetPage;
      }

      setPages(updatedPages); setCurrentPageIndex(newIndex); setSteps(targetPage.steps); setActiveStepId(targetPage.activeStepId);

      // 🚨 [마법 2]: 이전 화면을 보여주면서 다음 배경 이미지를 조용히 완성해 둡니다.
      let bgImage = null;
      if (targetPage.background) {
        bgImage = await prepareBackgroundImage(targetPage.background);
      }

      // 🚨 조립이 끝나면, 그제서야 화면을 비우고 단숨에 얹습니다. (하얀 화면 깜빡임 제거)
      canvas.clear();
      canvas.backgroundColor = "#ffffff";

      let objectsToLoad: any[] = [];
      if (targetPage.background?.drawingsJson?.objects) objectsToLoad.push(...targetPage.background.drawingsJson.objects);
      if (targetPage.json?.objects) objectsToLoad.push(...targetPage.json.objects);

      if (objectsToLoad.length > 0) {
        const mergedJson = { version: targetPage.json?.version || "5.3.0", objects: objectsToLoad };
        await canvas.loadFromJSON(mergedJson);
      }

      // 준비된 배경(bgImage)을 캔버스 맨 밑으로 밀어 넣기
      if (bgImage) {
        canvas.add(bgImage);
        canvas.sendObjectToBack(bgImage);
      }

      canvas.requestRenderAll();
      (canvas as any).fire("canvas:reloaded");

      // 🚀 [마법 3]: 화면이 뜨자마자 사용자가 넘어갈 확률이 높은 앞뒤 1장을 뒤에서 미리 그려서 캐시에 넣습니다!
      setTimeout(() => {
        if (updatedPages[newIndex + 1]?.background) prepareBackgroundImage(updatedPages[newIndex + 1].background);
        if (updatedPages[newIndex - 1]?.background) prepareBackgroundImage(updatedPages[newIndex - 1].background);
      }, 300);

    } finally {
      isNavigating.current = false;
    }
  };

  const nextPage = () => changePage(currentPageIndex + 1);
  const prevPage = () => { if (currentPageIndex > 0) changePage(currentPageIndex - 1); };
  const deletePage = async () => {
    if (!canvas || isNavigating.current) return;
    if (pagesRef.current.length <= 1) { alert("마지막 남은 페이지는 삭제할 수 없습니다."); return; }
    if (confirm("현재 페이지를 삭제하시겠습니까?")) {
      const updatedPages = pagesRef.current.filter((_, index) => index !== currentPageIndex);
      await changePage(currentPageIndex >= updatedPages.length ? updatedPages.length - 1 : currentPageIndex, updatedPages);
    }
  };

  return { pages, setPages, currentPageIndex, setCurrentPageIndex, changePage, nextPage, prevPage, deletePage };
};