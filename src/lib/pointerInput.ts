// 🎯 입력(펜/마우스/손가락) 판별.
//
// ⚠️ 일부 기기(삼성 등)에선 S펜이 Fabric 내부 이벤트에선 "touch"로 들어와서 pointerType만으론
//    손가락과 구분이 안 된다. 그런데 '창(window)'에서는 같은 펜이 PointerEvent(type=pen)로 정확히 잡힌다.
//    → 그래서 창에서 본 '펜의 위치/시각'을 기록해두고, Fabric이 받은 터치가 그 펜과
//       "같은 위치·비슷한 시각"이면 그 펜으로 보고 필기 허용. 펜과 무관한 터치(손가락/손바닥)는 금지.
//    (펜 tip과 손바닥은 물리적으로 떨어져 있으므로 '위치'로 확실히 구분된다.)

let lastPen = { x: 0, y: 0, t: 0 };

// 창(window) pointerdown/move에서 호출 → 펜(type=pen)의 최신 위치/시각 기록.
export const noteWindowPointer = (e: any) => {
  if (e && e.pointerType === "pen" && typeof e.clientX === "number") {
    lastPen = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
};

const PEN_NEAR_MS = 200; // 펜 이벤트가 이 시간(ms) 내면 '펜 활성'으로 간주
const PEN_NEAR_PX = 60;  // 펜 위치와 이 거리(px) 내의 터치면 '같은 부위(=그 펜)'

// 이벤트의 화면 좌표 추출 (PointerEvent는 clientX/Y, TouchEvent는 touches[].clientX/Y).
const eventClientPos = (e: any): { x: number; y: number } | null => {
  if (typeof e?.clientX === "number") return { x: e.clientX, y: e.clientY };
  const t = e?.touches?.[0] ?? e?.changedTouches?.[0];
  if (t) return { x: t.clientX, y: t.clientY };
  return null;
};

// 이 터치가 '펜의 터치'인가? (최근·근접한 펜 이벤트와 겹치면 true)
const penCorrelated = (e: any): boolean => {
  if (Date.now() - lastPen.t > PEN_NEAR_MS) return false;
  const pos = eventClientPos(e);
  if (!pos) return false;
  return Math.hypot(pos.x - lastPen.x, pos.y - lastPen.y) < PEN_NEAR_PX;
};

// 손가락/손바닥(펜과 무관한 터치)인가? → 필기/지우기 X, 페이지 넘김 전용.
export const isFingerTouch = (e: any): boolean => {
  if (!e) return false;
  const isTouchType = e.pointerType === "touch" || (typeof TouchEvent !== "undefined" && e instanceof TouchEvent);
  if (!isTouchType) return false;
  return !penCorrelated(e); // 펜과 겹치지 않는 터치 = 손가락
};

// '필기 입력'으로 받아들일지 여부.
//  - 마우스 우클릭 / 펜 배럴(2) / 펜 지우개(5, buttons&32) → 지우기 제스처, 필기 X
//  - 펜/마우스 → 필기 O
//  - 터치 → '그 펜과 겹치는 터치'만 O(펜이 touch로 위장된 것), 그 외 손가락은 X
/** Fabric mouse:down 의 options.e — pointerType 이 없을 수 있음 (Fabric 7 래퍼) */
export const eventPointerType = (e: any): string | undefined => {
  if (!e) return undefined;
  if (e.pointerType) return e.pointerType as string;
  if (typeof TouchEvent !== "undefined" && e instanceof TouchEvent) return "touch";
  if (e instanceof MouseEvent) return "mouse";
  if (typeof e.clientX === "number" && !e.touches?.length) return "mouse";
  return undefined;
};

export const isDrawInput = (e: any): boolean => {
  if (!e) return true; // 정보 없으면 기존 동작 유지(허용)
  if (e.button === 2 || e.button === 5) return false;
  if ((e.buttons & 2) !== 0 || (e.buttons & 32) !== 0) return false;
  const ptr = eventPointerType(e);
  if (ptr === "pen" || ptr === "mouse") return true;
  if (ptr === "touch") return penCorrelated(e);
  return false;
};

/** 디버그: 원격/RDP 등에서 실제로 뭐로 들어오는지 (W3C pointerType 은 mouse|pen|touch 만 공식) */
export function describeInputEvent(e: unknown): string {
  if (!e || typeof e !== "object") return "e=null";
  const x = e as Record<string, unknown>;
  const ctor = (e as object).constructor?.name ?? "?";
  const rawPtr = x.pointerType;
  const inferred = eventPointerType(e);
  const parts = [
    `ctor=${ctor}`,
    `type=${x.type ?? "?"}`,
    `ptr=${rawPtr === undefined || rawPtr === "" ? "(empty)" : String(rawPtr)}`,
    `guess=${inferred ?? "(none)"}`,
    `btn=${x.button}`,
    `buttons=${x.buttons}`,
  ];
  if (x.pointerId != null) parts.push(`pointerId=${x.pointerId}`);
  if (x.isPrimary != null) parts.push(`primary=${x.isPrimary}`);
  if (x.width != null) parts.push(`w=${x.width}`);
  if (x.height != null) parts.push(`h=${x.height}`);
  if (x.pressure != null) parts.push(`pressure=${x.pressure}`);
  const cap = x.sourceCapabilities as { firesTouchEvents?: boolean } | undefined;
  if (cap?.firesTouchEvents != null) parts.push(`firesTouch=${cap.firesTouchEvents}`);
  return parts.join(" ");
}
