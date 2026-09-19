import { useEffect, useRef } from "react";
import * as fabric from "fabric";
import { getStroke } from "perfect-freehand";
import { isDrawInput } from "../lib/pointerInput";

export type PenStyle = "ballpoint" | "fountain" | "brush";

const PEN_STYLES = {
  ballpoint: { thinning: 0, smoothing: 0.3, streamline: 0.5 },
  fountain: { thinning: 0.7, smoothing: 0.5, streamline: 0.5 },
  brush: { thinning: 0.9, smoothing: 0.8, streamline: 0.8 },
};

export interface BrushConfig {
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  penStyle?: PenStyle;
}

const getSvgPathFromStroke = (stroke: number[][]) => {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
};

export const usePerfectFreehand = (
  canvas: fabric.Canvas | null,
  config: BrushConfig,
  isActive: boolean,
  onLiveStroke?: (path: fabric.Path) => void,
  allowDrawAtRef?: React.RefObject<(x: number, y: number) => boolean>
) => {
  const isDrawing = useRef(false);
  const points = useRef<number[][]>([]);
  const currentPath = useRef<fabric.Path | null>(null);
  const strokeId = useRef<string>("");
  const lastLive = useRef<number>(0);

  useEffect(() => {
    if (!canvas || !isActive) {
      if (canvas) canvas.isDrawingMode = false;
      return;
    }

    canvas.isDrawingMode = false;
    canvas.selection = false;

    const opacity = config.tool === "highlighter" ? 0.4 : 1.0;

    const handleMouseDown = (options: fabric.TPointerEventInfo) => {
      if (!isDrawInput(options.e)) return;
      const pointer = options.scenePoint;
      if (!pointer) return;
      if (allowDrawAtRef?.current && !allowDrawAtRef.current(pointer.x, pointer.y)) return;

      isDrawing.current = true;
      strokeId.current = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      lastLive.current = 0;

      points.current = [[pointer.x, pointer.y, (options.e as any).pressure || 0.5]];

      currentPath.current = new fabric.Path("M 0 0", {
        fill: config.color,
        opacity: opacity,
        strokeWidth: 0,
        selectable: false,
        evented: false,
      });
      currentPath.current.set({ id: strokeId.current } as any);
      canvas.add(currentPath.current);
    };

    const handleMouseMove = (options: fabric.TPointerEventInfo) => {
      if (!isDrawing.current || !currentPath.current) return;

      const pointer = options.scenePoint;
      if (!pointer) return;
      if (allowDrawAtRef?.current && !allowDrawAtRef.current(pointer.x, pointer.y)) return;

      points.current.push([pointer.x, pointer.y, (options.e as any).pressure || 0.5]);

      let strokeOptions;
      if (config.tool === "pen") {
        const style = PEN_STYLES[config.penStyle || "fountain"];
        strokeOptions = { size: config.size, ...style };
      } else {
        strokeOptions = { size: config.size, thinning: -0.2, smoothing: 0.5, streamline: 0.5 };
      }

      const stroke = getStroke(points.current, strokeOptions);
      const pathData = getSvgPathFromStroke(stroke);

      canvas.remove(currentPath.current);
      currentPath.current = new fabric.Path(pathData, {
        fill: config.color,
        opacity: opacity,
        strokeWidth: 0,
        selectable: false,
        evented: false,
      });
      currentPath.current.set({ id: strokeId.current } as any);
      canvas.add(currentPath.current);
      canvas.requestRenderAll();

      const now = Date.now();
      if (onLiveStroke && now - lastLive.current > 50) {
        lastLive.current = now;
        onLiveStroke(currentPath.current);
      }
    };

    const handleMouseUp = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;

      if (currentPath.current) {
        currentPath.current.setCoords();
        canvas.fire("path:created", { path: currentPath.current });
      }

      points.current = [];
      currentPath.current = null;
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [canvas, config, isActive, onLiveStroke, allowDrawAtRef]);
};
