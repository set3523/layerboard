import React, { useState, useEffect } from "react";
import {
    MousePointer2, Trash2, Pen, Highlighter, Type, Square,
    Scissors, Eraser, Minus, Circle, Triangle, Plus, X,
    PenLine, PenTool, Paintbrush, ChevronUp, ChevronDown, Maximize, Minimize
  } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { PenStyle, BrushConfig } from "../hooks/usePerfectFreehand";
import { ShapeType } from "../hooks/useShape";

const PRESET_COLORS = ["#000000", "#0000FF", "#FF0000", "#008000", "#add8e6"];
const PEN_TYPES: { id: PenStyle; label: string; icon: React.ReactNode }[] = [
  { id: "ballpoint", label: "볼펜", icon: <PenLine size={18} /> },
  { id: "fountain", label: "만년필", icon: <PenTool size={18} /> },
  { id: "brush", label: "붓펜", icon: <Paintbrush size={18} /> },
];

export interface FloatingToolbarProps {
  activeTool: "select" | "pen" | "highlighter" | "eraser" | "text" | "capture" | "shape";
  handleToolClick: (tool: any) => void;
  hasSelection: boolean;
  deleteSelectedObjects: () => void;
  mode: "edit" | "class";
  popoverOpen: "pen" | "highlighter" | "shape" | null;
  selectedShape: ShapeType;
  setSelectedShape: (shape: ShapeType) => void;
  penConfig: { color: string; size: number; style: PenStyle };
  currentConfig: BrushConfig;
  updateConfig: (updates: any) => void;
  showColorPicker: boolean;
  setShowColorPicker: (show: boolean) => void;
}

const FloatingToolbar = ({
  activeTool,
  handleToolClick,
  hasSelection,
  deleteSelectedObjects,
  mode,
  popoverOpen,
  selectedShape,
  setSelectedShape,
  penConfig,
  currentConfig,
  updateConfig,
  showColorPicker,
  setShowColorPicker,
}: FloatingToolbarProps) => {
  // 접기(숨김) 상태만 관리 — hover 자동표시는 제거(색깔창이 감지영역을 넓혀 툴바가 내려오던 버그 원인).
  const [collapsed, setCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 🖥️ 전체화면 상태를 브라우저 이벤트와 동기화 (ESC로 빠져나가도 아이콘 맞춤)
  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const doc: any = document;
    const el: any = document.documentElement;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!active) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    }
  };

  const toolBtn = (active: boolean, activeCls: string) =>
    `p-2 rounded-xl transition-all ${active ? activeCls : "text-gray-500 hover:bg-gray-100"}`;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center z-20 origin-top scale-[0.72] sm:scale-90">
      {collapsed ? (
        // 접힘 상태: 아래 손잡이 클릭 → 펼치기
        <button
          onClick={() => setCollapsed(false)}
          title="툴바 펼치기"
          className="gg-glass px-6 py-1 rounded-b-xl border border-t-0 border-gray-200 text-gray-400 hover:text-leaf-600 transition-colors"
        >
          <ChevronDown size={18} />
        </button>
      ) : (
        <>
          {/* 메인 툴바 */}
          <div className="flex items-center gap-1.5 p-1.5 gg-glass">
            <button onClick={() => handleToolClick("select")} className={toolBtn(activeTool === "select", "bg-gray-200 text-gray-800 shadow-sm")}><MousePointer2 size={20} /></button>
            {hasSelection && <button onClick={deleteSelectedObjects} className="p-2 rounded-xl bg-red-100 text-red-600 shadow-sm hover:bg-red-200 transition-all animate-in zoom-in-75"><Trash2 size={20} /></button>}

            <div className="w-[1px] h-6 bg-gray-200 mx-0.5" />

            <button onClick={() => handleToolClick("pen")} className={toolBtn(activeTool === "pen", "bg-leaf-100 text-leaf-600 shadow-sm")}><Pen size={20} /></button>
            <button onClick={() => handleToolClick("highlighter")} className={toolBtn(activeTool === "highlighter", "bg-yellow-100 text-yellow-600 shadow-sm")}><Highlighter size={20} /></button>
            <button onClick={() => handleToolClick("text")} className={toolBtn(activeTool === "text", "bg-gray-200 text-gray-800 shadow-sm")}><Type size={20} /></button>
            <button onClick={() => handleToolClick("shape")} className={toolBtn(activeTool === "shape", "bg-emerald-100 text-emerald-600 shadow-sm")}><Square size={20} /></button>
            {mode === "edit" && <button onClick={() => handleToolClick("capture")} className={toolBtn(activeTool === "capture", "bg-purple-100 text-purple-600 shadow-sm")}><Scissors size={20} /></button>}

            <div className="w-[1px] h-6 bg-gray-200 mx-0.5" />

            <button onClick={() => handleToolClick("eraser")} className={toolBtn(activeTool === "eraser", "bg-gray-200 text-gray-800 shadow-sm")}><Eraser size={20} /></button>

            <div className="w-[1px] h-6 bg-gray-200 mx-0.5" />

            {/* 🖥️ 전체화면 토글 */}
            <button onClick={toggleFullscreen} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-all" title={isFullscreen ? "전체화면 끄기" : "전체화면"}>
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            {/* 접기 */}
            <button onClick={() => setCollapsed(true)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all" title="툴바 숨기기">
              <ChevronUp size={20} />
            </button>
          </div>

          {/* 설정 팝업 (색상 / 도형 / 굵기) */}
          {popoverOpen && (
            <div className="mt-3 w-64 gg-glass p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">

              {/* 도형 모양 */}
              {activeTool === "shape" && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-gray-600">도형 모양</span>
                  <div className="flex justify-between gap-2">
                    <button onClick={() => setSelectedShape("line")} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all ${selectedShape === "line" ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-sm" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"}`}><Minus size={18} /> <span className="text-[10px] font-medium">직선</span></button>
                    <button onClick={() => setSelectedShape("rect")} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all ${selectedShape === "rect" ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-sm" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"}`}><Square size={18} /> <span className="text-[10px] font-medium">네모</span></button>
                    <button onClick={() => setSelectedShape("circle")} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all ${selectedShape === "circle" ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-sm" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"}`}><Circle size={18} /> <span className="text-[10px] font-medium">동그라미</span></button>
                    <button onClick={() => setSelectedShape("triangle")} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all ${selectedShape === "triangle" ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-sm" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"}`}><Triangle size={18} /> <span className="text-[10px] font-medium">세모</span></button>
                  </div>
                </div>
              )}

              {/* 펜촉 */}
              {activeTool === "pen" && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-gray-600">펜촉</span>
                  <div className="flex justify-between gap-2">
                    {PEN_TYPES.map((type) => (
                      <button key={type.id} onClick={() => updateConfig({ style: type.id })} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all ${penConfig.style === type.id ? "bg-leaf-50 border-leaf-500 text-leaf-600 shadow-sm" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>{type.icon}<span className="text-[10px] font-medium">{type.label}</span></button>
                    ))}
                  </div>
                </div>
              )}

              {/* 굵기 */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm font-semibold text-gray-600"><span>굵기</span><span>{currentConfig.size}px</span></div>
                <input type="range" min="1" max="50" value={currentConfig.size} onChange={(e) => updateConfig({ size: Number(e.target.value) })} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-leaf-600" />
              </div>

              {/* 색상 (프리셋 + 컬러피커) */}
              <div className="flex flex-col gap-3 relative">
                <span className="text-sm font-semibold text-gray-600">색상</span>
                <div className="flex items-center gap-3">
                  {PRESET_COLORS.map((color) => (
                    <button key={color} onClick={() => updateConfig({ color })} className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${currentConfig.color === color ? "border-gray-800 scale-110 shadow-md" : "border-transparent shadow-sm"}`} style={{ backgroundColor: color }} />
                  ))}
                  <button onClick={() => setShowColorPicker(!showColorPicker)} className="w-7 h-7 rounded-full border-2 border-gray-300 bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"><Plus size={14} className="text-gray-600" /></button>
                </div>

                {showColorPicker && (
                  <div className="absolute top-full mt-3 left-0 z-30 p-3 gg-glass">
                    <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-gray-500">커스텀 색상</span><button onClick={() => setShowColorPicker(false)}><X size={14} className="text-gray-400 hover:text-gray-700" /></button></div>
                    <HexColorPicker color={currentConfig.color} onChange={(color) => updateConfig({ color })} />
                  </div>
                )}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FloatingToolbar;
