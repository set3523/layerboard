// src/hooks/useBackgroundLoader.ts (전체 덮어쓰기)
import { useState } from "react";
import * as fabric from "fabric";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PageData } from "./usePagination";
import { uploadFileToCloud, resolveStorageUrl, downloadStorageAsDataUrl } from "../lib/storage";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// ✅ blob URL 스텁 제거 → 실제 Supabase Storage 업로드 사용 (배경이 학생/새로고침에도 뜨도록)
//    다른 파일에서 이 모듈 경유로 import 하던 경우를 위해 재노출
export { uploadFileToCloud };

import { getPageDimensions, PageOrientation } from "../lib/pageFormat";

// 🧠 메모리 폭발 방지: 최대 10장까지만 기억하는 지능형 캐시 (LRU 방식)
const MAX_CACHE_SIZE = 20;
const pdfCache: Record<string, any> = {};
const pageImageCache = new Map<string, string>();

/** 로그아웃 시 PDF 문서·렌더 PNG 메모리 캐시 비우기 */
export function clearBackgroundCaches() {
  for (const key of Object.keys(pdfCache)) delete pdfCache[key];
  pageImageCache.clear();
}

export const useBackgroundLoader = (
  canvas: fabric.Canvas | null,
  pages: PageData[],               // 👈 추가
  currentPageIndex: number,        // 👈 추가
  setPages: React.Dispatch<React.SetStateAction<PageData[]>>,
  changePage: (index: number, overridePages?: PageData[]) => Promise<void>
) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (file: File, orientation: "portrait" | "landscape" = "portrait") => {
    if (!canvas) return;
    setIsLoading(true);

    try {
      const storagePath = await uploadFileToCloud(file);
      
      // 1️⃣ 바깥쪽에 let으로 빈 배열을 하나 만들어 줍니다.
      let newPages: PageData[] = [];

      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        pdfCache[storagePath] = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pdf = pdfCache[storagePath];
        
        // 2️⃣ ❌ 기존에 있던 const newPages: PageData[] = []; 는 지웁니다!
        for (let i = 1; i <= pdf.numPages; i++) {
          // 바깥에서 만든 newPages에 밀어 넣습니다.
          newPages.push({
            json: null,
            background: {
              type: "pdf",
              path: storagePath,
              url: null,
              pdfPageNumber: i,
              opacity: 1,
              orientation,
            },
            steps: [{ id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }],
            activeStepId: "step-1"
          });
        }
        // ❌ 기존에 있던 await changePage(0, newPages); 삭제 완료!
      } 
      else if (file.type.startsWith("image/")) {
        // 3️⃣ ❌ 여기도 const와 : PageData[] 를 지우고 바로 배열을 덮어씌웁니다.
        newPages = [{
          json: null,
          background: { type: "image", path: storagePath, url: null, opacity: 1, orientation },
          steps: [{ id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }],
          activeStepId: "step-1"
        }];
        // ❌ 기존에 있던 await changePage(0, newPages); 삭제 완료!
      }

      // 4️⃣ 마지막에 여기서 한 방에 처리합니다! (현재 페이지 뒤에 끼워넣기)
      if (newPages.length > 0) {
        if (pages && pages.length > 0) {
          const updatedPages = [...pages];
          updatedPages.splice(currentPageIndex + 1, 0, ...newPages); 
          await changePage(currentPageIndex + 1, updatedPages);
        } else {
          // 기존 도화지가 하나도 없으면 0번째부터 덮어쓰기
          await changePage(0, newPages);
        }
      }
    } catch (error) {
      console.error("파일 로드 에러:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return { handleFileUpload, isLoading };
};

// 🚀 깜빡임 방지의 핵심! 화면을 지우기 전에 메모리 안에서 이미지를 먼저 '완성'해 둡니다.
const backgroundStorageKey = (background: any): string | null => {
  if (background?.path) return background.path;
  if (background?.url && !String(background.url).startsWith("http")) return background.url;
  return background?.url ?? null;
};

export const prepareBackgroundImage = async (background: any): Promise<fabric.Image | null> => {
  if (!background || background.type === "none") return null;
  const storageKey = backgroundStorageKey(background);
  if (!storageKey && background.type !== "none") return null;

  let dataUrl: string = "";
  const cacheKey = `${storageKey}_${background.pdfPageNumber ?? ""}`;

  try {
    if (background.type === "pdf") {
      const cachedUrl = pageImageCache.get(cacheKey);

      // 1. 이미 캐시에 있으면 0초 만에 바로 꺼내옵니다.
      if (cachedUrl) {
        dataUrl = cachedUrl;
        // 이미 있으면 우선순위를 제일 최근으로 갱신!
        pageImageCache.delete(cacheKey);
        pageImageCache.set(cacheKey, dataUrl);
      } 
      // 2. 캐시에 없으면 새로 그립니다.
      else {
        const pdfSrcKey = background.path ?? storageKey;
        if (!pdfCache[pdfSrcKey]) {
          const signed = await resolveStorageUrl(pdfSrcKey, "backgrounds");
          pdfCache[pdfSrcKey] = await pdfjsLib.getDocument({ url: signed }).promise;
        }
        const pdf = pdfCache[pdfSrcKey];
        const page = await pdf.getPage(background.pdfPageNumber);
        const viewport = page.getViewport({ scale: 2.0 });

        const htmlCanvas = document.createElement("canvas");
        htmlCanvas.width = viewport.width; htmlCanvas.height = viewport.height;
        const ctx = htmlCanvas.getContext("2d");

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          dataUrl = htmlCanvas.toDataURL("image/png");

          // ✨ 20장을 초과하면 제일 옛날 이미지를 삭제해서 메모리 방어!
          pageImageCache.set(cacheKey, dataUrl);
          if (pageImageCache.size > MAX_CACHE_SIZE) {
            const firstKey = pageImageCache.keys().next().value;
            if (firstKey) pageImageCache.delete(firstKey);
          }
        }
        htmlCanvas.width = 0; htmlCanvas.height = 0; // 즉시 휴지통
      }
    } else if (background.type === "image") {
      // signed URL 직접 로드는 CORS taint → 자르기(toDataURL)에 배경이 빠짐
      dataUrl = await downloadStorageAsDataUrl(storageKey!, "backgrounds");
    }

    // ✨ 완벽한 문자열(string) 상태에서만 이미지를 생성!
    if (dataUrl !== "") {
      const img = await fabric.Image.fromURL(dataUrl);
      const orientation = (background.orientation || "portrait") as PageOrientation;
      const { width: frameW, height: frameH } = getPageDimensions(orientation);

      // PDF/이미지를 A4 용지 프레임 안에 contain (비율 유지)
      const naturalW = img.width! || frameW;
      const naturalH = img.height! || frameH;
      const scale = Math.min(frameW / naturalW, frameH / naturalH);
      img.scale(scale);

      img.set({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        opacity: background.opacity || 1,
        isBackground: true,
      } as any);

      return img;
    }
  } catch (error) {
    console.error("배경 준비 실패:", error);
  }
  return null;
};