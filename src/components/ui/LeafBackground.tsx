import React from "react";

// 🍃 초록 잎사귀 + 물방울을 옅게 흩뿌린 장식 배경.
//    부모에 position:relative 필요(권장: 최상위 컨테이너에 .gg-page). 콘텐츠는 이 위에 z-10 이상으로.

const Leaf = ({ style, size = 120, opacity = 0.5 }: { style: React.CSSProperties; size?: number; opacity?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ position: "absolute", opacity, ...style }}>
    <path d="M12 2C18 6 18.5 15 12 22C5.5 15 6 6 12 2Z" fill="var(--color-leaf-300)" />
    <path d="M12 3.5V21" stroke="var(--color-leaf-500)" strokeWidth="0.6" opacity="0.6" />
  </svg>
);

const Drop = ({ style, size = 90, color = "rgba(119,176,52,0.14)" }: { style: React.CSSProperties; size?: number; color?: string }) => (
  <div aria-hidden style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: color, ...style }} />
);

export default function LeafBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <Drop style={{ top: -40, right: -30 }} size={220} color="rgba(157,203,92,0.20)" />
      <Drop style={{ bottom: -50, left: -40 }} size={180} color="rgba(119,176,52,0.12)" />
      <Drop style={{ top: 140, right: 80 }} size={70} color="rgba(191,224,140,0.30)" />
      <Leaf style={{ top: 40, left: -20, transform: "rotate(-25deg)" }} size={140} opacity={0.45} />
      <Leaf style={{ top: 120, right: 24, transform: "rotate(35deg)" }} size={90} opacity={0.4} />
      <Leaf style={{ bottom: 70, left: "42%", transform: "rotate(-70deg)" }} size={72} opacity={0.35} />
      <Leaf style={{ bottom: -8, right: "22%", transform: "rotate(15deg)" }} size={110} opacity={0.4} />
    </div>
  );
}
