import * as fabric from "fabric";
import { getPageDimensions, PAGE_FRAME_PROPS, PageOrientation } from "./pageFormat";

/** 흰 A4 용지 레이어 (필기 가능 영역). 캔버스 배경은 검정(레터박스). */
export function addPageFrameToCanvas(
  canvas: fabric.Canvas,
  orientation: PageOrientation = "portrait"
): fabric.Rect {
  const { width, height } = getPageDimensions(orientation);
  const frame = new fabric.Rect({
    width,
    height,
    left: 0,
    top: 0,
    originX: "center",
    originY: "center",
    ...PAGE_FRAME_PROPS,
  });
  (frame as any).isPageFrame = true;
  canvas.add(frame);
  canvas.sendObjectToBack(frame);
  return frame;
}
