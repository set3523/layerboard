"use client";
import { useEffect } from "react";

// 🍃 큰 버튼(.gg-drop, 높이 --gg-drop-min 이상)을 누르면 클릭 좌표에서 물방울이 '톡' 터지는 효과.
//    layout.tsx에 한 번만 마운트하면 전 페이지 자동 적용.
export default function GlassGreenRipple() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(".gg-drop") as HTMLElement | null;
      if (!btn) return;
      const min = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--gg-drop-min")) || 44;
      const rect = btn.getBoundingClientRect();
      if (rect.height < min) return; // 일정 크기 이상 버튼만 터짐
      const r = document.createElement("span");
      r.className = "gg-ripple";
      r.style.left = `${e.clientX - rect.left}px`;
      r.style.top = `${e.clientY - rect.top}px`;
      btn.appendChild(r);
      window.setTimeout(() => r.remove(), 650);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
