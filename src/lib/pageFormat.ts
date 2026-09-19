/** A4 논리 좌표 (210:297). 모든 기기·필기·PDF 배치의 기준 */
export type PageOrientation = "portrait" | "landscape";

const A4_RATIO = 297 / 210;
export const PAGE_LOGICAL_WIDTH = 1000;

export function getPageDimensions(orientation: PageOrientation = "portrait"): {
  width: number;
  height: number;
} {
  if (orientation === "landscape") {
    return {
      width: Math.round(PAGE_LOGICAL_WIDTH * A4_RATIO),
      height: PAGE_LOGICAL_WIDTH,
    };
  }
  return {
    width: PAGE_LOGICAL_WIDTH,
    height: Math.round(PAGE_LOGICAL_WIDTH * A4_RATIO),
  };
}

export function isInsidePageFrame(
  x: number,
  y: number,
  orientation: PageOrientation = "portrait"
): boolean {
  const { width, height } = getPageDimensions(orientation);
  return x >= -width / 2 && x <= width / 2 && y >= -height / 2 && y <= height / 2;
}

export const roomPageOrientationKey = (roomCode: string) =>
  `room_${roomCode}_pageOrientation`;

export const PAGE_FRAME_PROPS = {
  fill: "#ffffff",
  selectable: false,
  evented: false,
  isPageFrame: true,
} as const;
