"use client";
import { useEffect } from "react";

// 🍃 Glass Green 디자인 규칙 — 단일 프로바이더.
//   layout.tsx에 <GlassGreen/> "한 줄"이면 전 페이지 자동 적용:
//     · <html>.gg-theme 바탕  · 잎/물방울 낙하 배경  · 큰 버튼(.gg-drop) 물방울 터짐
//   이 한 줄을 빼면 전부 사라짐. 위치·크기·낙하 등 모든 시각 규칙은 globals.css(.gg-*)에 저장.
//   (예전 LeafBackground.tsx / GlassGreenRipple.tsx는 이 파일로 통합됨 → 삭제해도 됨)

// 장식 노드 순서 = globals.css `.gg-decor > i:nth-child` 규칙과 1:1 매칭
const DECOR = ["leaf", "dew", "leaf", "dew", "leaf", "dew", "leaf", "dew", "leaf"] as const;

export default function GlassGreen() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("gg-theme");

    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(".gg-drop") as HTMLElement | null;
      if (!btn) return;
      const min = parseInt(getComputedStyle(html).getPropertyValue("--gg-drop-min")) || 44;
      const rect = btn.getBoundingClientRect();
      if (rect.height < min) return; // 일정 크기 이상 버튼만 물방울 터짐
      const r = document.createElement("span");
      r.className = "gg-ripple";
      r.style.left = `${e.clientX - rect.left}px`;
      r.style.top = `${e.clientY - rect.top}px`;
      btn.appendChild(r);
      window.setTimeout(() => r.remove(), 650);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      html.classList.remove("gg-theme");
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div className="gg-decor" aria-hidden>
      {DECOR.map((t, i) => (
        <i key={i} className={t === "leaf" ? "gg-leaf" : "gg-dew"} />
      ))}
    </div>
  );
}
