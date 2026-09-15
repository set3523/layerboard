import React from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";

// ✨ 메인 파일(Whiteboard.tsx)에서 받아올 데이터 규격서
export interface BottomBarProps {
  currentPageIndex: number;
  totalPages: number;
  prevPage: () => void;
  nextPage: () => void;
  deletePage: () => void;
  mode: "edit" | "class";
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pdfFilePending: File | null;
  setPdfFilePending: (file: File | null) => void;
  handleFileUpload: (file: File, orientation: "portrait" | "landscape") => void;
}

const BottomBar = ({
  currentPageIndex,
  totalPages,
  prevPage,
  nextPage,
  deletePage,
  mode,
  fileInputRef,
  pdfFilePending,
  setPdfFilePending,
  handleFileUpload
}: BottomBarProps) => {

  return (
    <>
      {/* 1. 하단 중앙: 페이지 이동 컨트롤러 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 gg-glass px-5 py-2.5 z-20 origin-bottom scale-90 sm:scale-100">
        <button 
          onClick={prevPage} 
          disabled={currentPageIndex === 0} 
          className="p-2 text-gray-500 hover:text-leaf-600 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
          title="이전 페이지"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-bold text-gray-700 min-w-[3rem] text-center tracking-widest">
          {currentPageIndex + 1} <span className="text-gray-300 mx-1">/</span> {Math.max(totalPages, currentPageIndex + 1)}
        </span>
        <button 
          onClick={nextPage} 
          className="p-2 text-gray-500 hover:text-leaf-600 transition-colors"
          title="다음 페이지"
        >
          <ChevronRight size={20} />
        </button>
        
        {/* 편집 모드일 때만 휴지통(페이지 삭제) 보이기 */}
        {mode === "edit" && (
          <>
            <div className="w-[1px] h-6 bg-gray-200 mx-1" />
            <button onClick={deletePage} className="p-2 text-red-400 hover:text-red-600 transition-colors active:scale-90" title="현재 페이지 삭제">
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>
      
      {/* 2. 우측 하단: 교재(PDF/이미지) 추가 버튼 */}
      {mode === "edit" && (
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="absolute bottom-8 right-8 w-14 h-14 bg-leaf-600 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-10 shadow-leaf-200 animate-in fade-in zoom-in-75 duration-200"
          title="교재/이미지 업로드"
        >
          <Plus size={28} />
        </button>
      )}

      {/* 3. 화면 전체 덮기: PDF 방향 설정 모달창 */}
      {pdfFilePending && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="gg-glass p-6 flex flex-col gap-5 animate-in zoom-in-95 max-w-sm w-full">
            <h3 className="text-xl font-bold text-gray-800 text-center">PDF 방향 설정</h3>
            <p className="text-sm text-gray-500 text-center -mt-2">수업 환경에 맞춰 PDF를 어떻게 띄울까요?</p>
            <div className="flex flex-col gap-3 mt-2">
              <button 
                onClick={() => { handleFileUpload(pdfFilePending, "portrait"); setPdfFilePending(null); }} 
                className="gg-btn gg-btn--ghost gg-btn--block"
              >
                세로로 맞추기 (원본 비율)
              </button>
              <button 
                onClick={() => { handleFileUpload(pdfFilePending, "landscape"); setPdfFilePending(null); }} 
                className="gg-btn gg-btn--primary gg-btn--block"
              >
                가로로 눕히기 (-90도 회전)
              </button>
            </div>
            <button 
              onClick={() => setPdfFilePending(null)} 
              className="mt-2 py-2 text-sm text-gray-400 font-semibold hover:text-gray-600 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default BottomBar;