// src/components/TeacherControlPanel.tsx
import React from "react";
import { BookOpen, Image as ImageIcon, Eye, EyeOff, Layers, Plus } from "lucide-react";
import { RoomState } from "../types/board";
import { Step } from "../hooks/useSteps";
import { PageData } from "../hooks/usePagination";

// ✨ 메인 파일(Whiteboard.tsx)에서 받아올 데이터 규격서
export interface TeacherControlPanelProps {
  mode: "edit" | "class"; // ✨ 현재 모드(배경편집 or 수업) 받아오기 추가!
  roomState: RoomState;
  updateRoomState: (updates: Partial<RoomState>) => void;
  currentPageIndex: number;
  pages: PageData[];
  setPages: React.Dispatch<React.SetStateAction<PageData[]>>;
  activeStudents: string[];
  roster?: { name: string; joinedAt: number }[]; // 현재 접속 중인 학생(presence)
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  activeStepId: string;
  setActiveStepId: React.Dispatch<React.SetStateAction<string>>;
  // 🚨 updateStepOpacity는 삭제했습니다! (내부에서 setSteps로 직접 처리)
  emitSyncPages: (pages: PageData[]) => void; 
  emitSyncSteps: (steps: Step[]) => void;     
  bgOpacity: number;                     // ✨ 추가
  setBgOpacity: (val: number) => void;
}

const TeacherControlPanel = ({
  mode,
  roomState,
  updateRoomState,
  currentPageIndex,
  pages,
  setPages,
  activeStudents,
  roster = [],
  steps,
  setSteps,
  activeStepId,
  setActiveStepId,
  emitSyncPages,
  emitSyncSteps,
  bgOpacity,        // ✨ 추가
  setBgOpacity
}: TeacherControlPanelProps) => {

  return (
    <div className="absolute top-6 right-6 w-80 gg-glass p-5 z-20 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 origin-top-right scale-[0.7] sm:scale-100">
      
      {/* 1. 수업 모드 */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <span className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} className="text-leaf-600"/> 강제 수업 모드</span>
        <button 
          onClick={() => updateRoomState({ isClassMode: !roomState.isClassMode, currentPageIndex: currentPageIndex })} 
          className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all shadow-sm ${roomState.isClassMode ? "bg-red-500 text-white shadow-red-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
        >
          {roomState.isClassMode ? "ON (학생 고정)" : "OFF"}
        </button>
      </div>

      {/* 2. 배경 설정 (투명도) */}
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

      {/* ✨ 편집 모드가 아닐 때(수업 모드일 때)만 아래 학생 통제와 풀이 단계 UI 노출! */}
      {mode !== "edit" && (
        <>
          {/* 👥 현재 참가자 (실시간 접속 명단) */}
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

          {/* 3. 학생 필기 통제 */}
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
            <span className="text-sm font-bold text-gray-800 flex items-center gap-2">👨‍🎓 학생 필기 통제</span>
            {activeStudents.length === 0 ? (
              <span className="text-xs text-gray-400 text-center py-2">아직 필기한 학생이 없습니다.</span>
            ) : (
              activeStudents.map((studentName) => {
                const config: { mode: "all" | "teacher" | "hidden"; opacity: number } =
                  roomState.studentVisibilities[studentName] || { mode: "all", opacity: 1 };
                const mode = config.mode ?? "all";
                const setMode = (m: "all" | "teacher" | "hidden") =>
                  updateRoomState({ studentVisibilities: { ...roomState.studentVisibilities, [studentName]: { ...config, mode: m } } });
                const MODES: { id: "hidden" | "teacher" | "all"; label: string }[] = [
                  { id: "hidden", label: "숨김" },
                  { id: "teacher", label: "선생님만" },
                  { id: "all", label: "모두" },
                ];
                return (
                  <div key={studentName} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-sm font-medium text-gray-700 block mb-2">{studentName}</span>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {MODES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setMode(m.id)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === m.id ? "bg-leaf-600 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-100"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.1" value={config.opacity ?? 1}
                      onChange={(e) => updateRoomState({ studentVisibilities: { ...roomState.studentVisibilities, [studentName]: { ...config, opacity: parseFloat(e.target.value) } } })}
                      className="w-full accent-orange-500"
                    />
                  </div>
                )
              })
            )}
          </div>

          {/* 4. 풀이 단계 (Step) 통합 제어 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-leaf-600" />
                <h3 className="text-sm font-bold text-gray-800">풀이 단계</h3>
              </div>
              <button 
                onClick={() => {
                  const newId = `step-${steps.length + 1}`;
                  // ✨ 핵심 1 수정: 방금 전까지 활성화되어 있던(activeStepId) 녀석만 0.2로 낮추고, 나머지는 그대로 둡니다!
                  const nextSteps = [
                    ...steps.map(s => s.id === activeStepId ? { ...s, opacity: 0.2 } : s),
                    { id: newId, name: `Step ${steps.length + 1}`, isVisible: true, opacity: 1 }
                  ];
                  setSteps(nextSteps);
                  setActiveStepId(newId);
                  emitSyncSteps(nextSteps);
                }} 
                className="flex items-center gap-1 bg-leaf-50 text-leaf-600 hover:bg-leaf-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              >
                <Plus size={14} /> 다음 단계
              </button>
            </div>
            <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {steps.map((step) => (
                <li 
                  key={step.id} 
                  onClick={() => {
                    // ✨ 핵심 2 수정: 클릭해서 이동할 때도 똑같이 적용합니다!
                    const nextSteps = steps.map((s) => {
                      if (s.id === step.id) return { ...s, opacity: 1 }; // 내가 누른 건 1.0으로 진해짐
                      if (s.id === activeStepId) return { ...s, opacity: 0.2 }; // 방금 떠나온 건 0.2로 흐려짐
                      return s; // 나머지는 자기가 원래 갖고 있던 투명도 그대로 유지!
                    });
                    
                    setSteps(nextSteps);
                    setActiveStepId(step.id);
                    emitSyncSteps(nextSteps);
                  }} 
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${step.id === activeStepId ? "bg-leaf-50 border-leaf-300 shadow-sm" : "bg-white border-gray-100 hover:bg-gray-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${step.id === activeStepId ? "bg-leaf-500 animate-pulse" : "bg-gray-300"}`} />
                    <span className={`text-sm font-medium ${step.id === activeStepId ? "text-leaf-700" : "text-gray-600"}`}>{step.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" min="0.1" max="1" step="0.1" value={step.opacity ?? 1} 
                      onClick={(e) => e.stopPropagation()} 
                      onChange={(e) => {
                        const newOpacity = parseFloat(e.target.value);
                        
                        // ✅ 이 슬라이더는 '단계(Step) 투명도'를 조절 (기존엔 엉뚱하게 배경 데이터를 건드려서 안 먹혔음)
                        const nextSteps = steps.map((s) => s.id === step.id ? { ...s, opacity: newOpacity } : s);
            
                        setSteps(nextSteps);
                        emitSyncSteps(nextSteps);
                      }}
                      className="w-12 accent-leaf-600" 
                    />
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const nextSteps = steps.map((s) => s.id === step.id ? { ...s, isVisible: !s.isVisible } : s);
                        setSteps(nextSteps);
                        emitSyncSteps(nextSteps);
                      }} 
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {step.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

    </div>
  );
};

export default TeacherControlPanel;