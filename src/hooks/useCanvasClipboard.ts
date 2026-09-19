import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import { uploadDataUrlToCloud } from "../lib/storage";

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const isFormFieldFocused = () => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const ta = el as HTMLTextAreaElement;
    if (ta.classList.contains("fabric-textarea") || ta.dataset.fabric === "textarea") return false;
    return true;
  }
  return !!(el as HTMLElement)?.isContentEditable;
};

const isFabricTextEditing = (canvas: fabric.Canvas) => {
  const active = canvas.getActiveObject() as any;
  return active?.isEditing === true;
};

/** OS가 paste 이벤트에 실어 보낸 클립보드 — 별도 권한 없이 items/files 로 받음 */
function imageBlobFromDataTransfer(cd: DataTransfer | null): Blob | null {
  if (!cd) return null;
  for (const item of cd.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  for (let i = 0; i < cd.files.length; i++) {
    const f = cd.files[i];
    if (f.type.startsWith("image/")) return f;
  }
  return null;
}

async function imageBlobFromNavigatorClipboard(): Promise<Blob | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) return await item.getType(type);
    }
  } catch (err) {
    console.warn("clipboard.read 실패( paste 이벤트만 사용):", err);
  }
  return null;
}

async function addImageFromDataUrl(
  canvas: fabric.Canvas,
  dataUrl: string,
  skipCloudUpload: boolean,
  at: { x: number; y: number }
) {
  const img = await fabric.Image.fromURL(dataUrl);
  const maxW = 900;
  const naturalW = img.width ?? maxW;
  if (naturalW > maxW) img.scale(maxW / naturalW);

  img.set({
    left: at.x,
    top: at.y,
    originX: "center",
    originY: "center",
    cornerColor: "#77B034",
    borderColor: "#77B034",
    cornerSize: 12,
    transparentCorners: false,
    isCapture: true,
    isBackgroundDrawing: false,
    originalOpacity: 1,
  });

  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();

  if (!skipCloudUpload) {
    try {
      const path = await uploadDataUrlToCloud(dataUrl, "captures");
      (img as any).storagePath = path;
    } catch (err) {
      console.error("붙여넣기 Storage 업로드 실패(로컬 유지):", err);
    }
  }

  canvas.fire("path:created", { path: img } as any);
}

export const useCanvasClipboard = (
  canvas: fabric.Canvas | null,
  enabled: boolean,
  storageFullRef: React.RefObject<boolean>
) => {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const lastScenePoint = useRef<{ x: number; y: number } | null>(null);
  const pasteDedupe = useRef(0);

  useEffect(() => {
    if (!canvas) return;
    const onMove = (opt: fabric.TPointerEventInfo) => {
      if (opt.scenePoint) lastScenePoint.current = { x: opt.scenePoint.x, y: opt.scenePoint.y };
    };
    canvas.on("mouse:move", onMove);
    return () => {
      canvas.off("mouse:move", onMove);
    };
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;

    const pasteAt = () => {
      const p = lastScenePoint.current;
      if (p) return p;
      const vpt = canvas.viewportTransform;
      const zoom = canvas.getZoom();
      const w = canvas.width ?? 0;
      const h = canvas.height ?? 0;
      if (!vpt) return { x: 0, y: 0 };
      return { x: (w / 2 - vpt[4]) / zoom, y: (h / 2 - vpt[5]) / zoom };
    };

    const ingestImage = async (blob: Blob) => {
      const now = Date.now();
      if (now - pasteDedupe.current < 400) return;
      pasteDedupe.current = now;
      const dataUrl = await blobToDataUrl(blob);
      await addImageFromDataUrl(
        canvas,
        dataUrl,
        storageFullRef.current === true,
        pasteAt()
      );
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!enabledRef.current || isFormFieldFocused() || isFabricTextEditing(canvas)) return;
      const blob = imageBlobFromDataTransfer(e.clipboardData);
      if (!blob) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void ingestImage(blob);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "v") return;
      if (!enabledRef.current || isFormFieldFocused() || isFabricTextEditing(canvas)) return;
      // paste 이벤트가 먼저 오면 거기서 처리; 없을 때만 read 폴백
      void (async () => {
        await new Promise((r) => setTimeout(r, 0));
        if (Date.now() - pasteDedupe.current < 200) return;
        const blob = await imageBlobFromNavigatorClipboard();
        if (!blob) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        await ingestImage(blob);
      })();
    };

    const onCopy = async (e: KeyboardEvent) => {
      if (!enabledRef.current || isFormFieldFocused() || isFabricTextEditing(canvas)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
      const active = canvas.getActiveObject();
      if (!active || active.type !== "image") return;
      if ((active as any).isBackground) return;

      e.preventDefault();
      try {
        const dataUrl = active.toDataURL({ format: "png", multiplier: 1 });
        const blob = await (await fetch(dataUrl)).blob();
        const type = blob.type || "image/png";
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } catch (err) {
        console.error("클립보드 복사 실패:", err);
      }
    };

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onCopy);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onCopy);
    };
  }, [canvas, storageFullRef]);
};
