// src/components/HostControlPanel.tsx
import React from "react";
import { BookOpen, Image as ImageIcon } from "lucide-react";
import { RoomState } from "../types/board";
import { PageData } from "../hooks/usePagination";

export interface HostControlPanelProps {
  mode: "edit" | "class";
  roomState: RoomState;
  updateRoomState: (updates: Partial<RoomState>) => void;
  currentPageIndex: number;
  pages: PageData[];
  setPages: React.Dispatch<React.SetStateAction<PageData[]>>;
  activeStudents: string[];
  roster?: { name: string; joinedAt: number }[];
  emitSyncPages: (pages: PageData[]) => void;
  bgOpacity: number;
  setBgOpacity: (val: number) => void;
  className?: string;
}

const HostControlPanel = ({
  mode,
  roomState,
  updateRoomState,
  currentPageIndex,
  pages,
  setPages,
  activeStudents,
  roster = [],
  emitSyncPages,
  bgOpacity,
  setBgOpacity,
  className = "",
}: HostControlPanelProps) => {
  return (
    <div
      className={`w-full gg-glass p-5 flex flex-col gap-6 shrink-0 animate-in fade-in slide-in-from-right-4 ${className}`}
    >

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <span className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} className="text-leaf-600"/> 강제 수업 모드</span>
        <button
          onClick={() => updateRoomState({ isClassMode: !roomState.isClassMode, currentPageIndex: currentPageIndex })}
          className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all shadow-sm ${roomState.isClassMode ? "bg-red-500 text-white shadow-red-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
        >
          {roomState.isClassMode ? "ON (학생 고정)" : "OFF"}
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <span className="text-sm font-bold text-gray-800">학생 배경·PDF 편집</span>
        <button
          type="button"
          onClick={() =>
            updateRoomState({
              allowStudentBackgroundEdit: !roomState.allowStudentBackgroundEdit,
            })
          }
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${roomState.allowStudentBackgroundEdit ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}
        >
          {roomState.allowStudentBackgroundEdit ? "허용" : "차단"}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
        <div className="flex justify-between text-sm font-semibold text-gray-700">
          <span className="flex items-center gap-2"><ImageIcon size={16}/> 배경 투명도</span>
          <span className="text-leaf-600">{Math.round(bgOpacity * 100)}%</span>
        </div>
        <input
          type="range" min="0.1" max="1" step="0.1"
          value={bgOpacity}
          onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
          className="w-full accent-leaf-600"
        />
      </div>

      {mode !== "edit" && (
        <>
          <div className="flex flex-col gap-2 border-b border-gray-200 pb-4">
            <span className="text-sm font-bold text-gray-800 flex items-center gap-2">👥 현재 참가자 <span className="text-xs font-semibold text-leaf-600">{roster.length}명</span></span>
            {roster.length === 0 ? (
              <span className="text-xs text-gray-400 text-center py-2">아직 입장한 학생이 없습니다.</span>
            ) : (
              <div className="flex flex-col gap-1">
                {roster.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> {s.name}</span>
                    <span className="text-[10px] text-gray-400">{new Date(s.joinedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 입장</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
            <span className="text-sm font-bold text-gray-800 flex items-center gap-2">👨‍🎓 학생 필기 통제</span>
            {activeStudents.length === 0 ? (
              <span className="text-xs text-gray-400 text-center py-2">아직 필기한 학생이 없습니다.</span>
            ) : (
              activeStudents.map((studentName) => {
                const config = roomState.studentVisibilities[studentName] || {
                  mode: "all" as const,
                  opacity: 1,
                  peekAll: false,
                };
                const vis = config.mode ?? "all";
                const setVis = (m: "all" | "host" | "hidden") =>
                  updateRoomState({
                    studentVisibilities: {
                      ...roomState.studentVisibilities,
                      [studentName]: { ...config, mode: m, peekAll: m === "host" ? config.peekAll : false },
                    },
                  });
                const MODES: { id: "hidden" | "host" | "all"; label: string }[] = [
                  { id: "hidden", label: "숨김" },
                  { id: "host", label: "방장만" },
                  { id: "all", label: "모두" },
                ];
                return (
                  <div key={studentName} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-sm font-medium text-gray-700 block mb-2">{studentName}</span>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {MODES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setVis(m.id)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${vis === m.id ? "bg-leaf-600 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-100"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {vis === "host" && (
                      <button
                        type="button"
                        onClick={() =>
                          updateRoomState({
                            studentVisibilities: {
                              ...roomState.studentVisibilities,
                              [studentName]: { ...config, peekAll: !config.peekAll },
                            },
                          })
                        }
                        className={`w-full mb-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          config.peekAll ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {config.peekAll ? "전부확인 ON" : "전부확인"}
                      </button>
                    )}
                    <input
                      type="range" min="0" max="1" step="0.1" value={config.opacity ?? 1}
                      onChange={(e) => updateRoomState({ studentVisibilities: { ...roomState.studentVisibilities, [studentName]: { ...config, opacity: parseFloat(e.target.value) } } })}
                      className="w-full accent-orange-500"
                    />
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

    </div>
  );
};

export default HostControlPanel;
